let peerConnection;
let dataChannel;
let ws;
let cryptoKey;
let isInitiator = false;

const localUsername = window.localUsername;

async function getTurnCreds() {
  const res = await fetch(`/get-turn-creds?user=${localUsername}`);
  return await res.json();
}

async function startConnection() {
  const creds = await getTurnCreds();

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:gojsi.cc:3478",
        username: creds.username,
        credential: creds.password
      }
    ]
  });

  ws = new WebSocket("wss://gojsi.cc:8765");

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.offer && !isInitiator) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      ws.send(JSON.stringify({ answer }));
    }

    if (data.answer && isInitiator) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  ws.onopen = async () => {
    console.log("✅ WebSocket connected");

    isInitiator = true; // or assign based on signaling logic
    if (isInitiator) {
      dataChannel = peerConnection.createDataChannel("chat");
      setupDataChannel();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      ws.send(JSON.stringify({ offer }));
    }
  };

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ candidate: event.candidate }));
    }
  };
}

function setupDataChannel() {
  dataChannel.onmessage = async (event) => {
    const decrypted = await decryptMessage(event.data);
    displayMessage("Peer", decrypted);
  };
}

// === Encryption ===
async function generateCryptoKey() {
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  cryptoKey = key;
}

async function encryptMessage(msg) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    enc.encode(msg)
  );
  return JSON.stringify({
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext))
  });
}

async function decryptMessage(payload) {
  const { iv, ciphertext } = JSON.parse(payload);
  const dec = new TextDecoder();
  const buffer = new Uint8Array(ciphertext);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    buffer
  );
  return dec.decode(decrypted);
}

// === Messaging ===
async function sendMessage() {
  const input = document.getElementById("messageInput");
  const msg = input.value.trim();
  if (!msg || !cryptoKey || !dataChannel || dataChannel.readyState !== "open") return;

  const encrypted = await encryptMessage(msg);
  dataChannel.send(encrypted);
  displayMessage("You", msg);
  input.value = "";
}

function displayMessage(sender, text) {
  const chatBox = document.getElementById("chatBox");
  const p = document.createElement("p");
  p.textContent = `${sender}: ${text}`;
  chatBox.appendChild(p);
}

window.onload = async () => {
  await generateCryptoKey();
  await startConnection();

  document.getElementById("sendButton").addEventListener("click", sendMessage);
  document.getElementById("messageInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
};
