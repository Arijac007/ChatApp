const peerConnection = new RTCPeerConnection();
let dataChannel;
let cryptoKey;
let ecdhKeyPair;
let isInitiator = false;


// === WebSocket Signaling ===
const ws = new WebSocket("ws://localhost:8765");

ws.onopen = () => {
    console.log("✅ WebSocket connected");
    isInitiator = true;

    if (isInitiator) {
    dataChannel = peerConnection.createDataChannel("chat");
    setupDataChannel();
}

peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
};


    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            ws.send(JSON.stringify({ offer: peerConnection.localDescription }));
        });
};


ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({ answer }));
    } else if (data.answer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
};

peerConnection.onicecandidate = (event) => {
    if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ candidate: event.candidate }));
    }
};

// === Data Channel Setup ===
async function rotateCryptoKey() {
    if (!dataChannel || dataChannel.readyState !== "open") {
        console.warn("❌ Cannot rotate key: dataChannel not ready");
        return;
    }

    console.log("🔄 Attempting to rotate encryption key...");
    document.getElementById("sendButton").disabled = true;
    cryptoKey = null; // Invalidate old key

    await generateECDHKeyPair(); // new key pair

    const publicKey = await crypto.subtle.exportKey("jwk", ecdhKeyPair.publicKey);
    dataChannel.send(JSON.stringify({ type: "key", data: publicKey, respond: true }));
    console.log("🔐 New key sent to peer.");
}



function checkKeyReady() {
    const sendBtn = document.getElementById("sendButton");
    if (!sendBtn) {
        console.error("❌ sendButton not found in DOM.");
        return;
    }

    if (cryptoKey) {
        sendBtn.disabled = false;
    } else {
        sendBtn.disabled = true;
        setTimeout(checkKeyReady, 500); // Try again after 500ms
    }
}


function setupDataChannel() {
    dataChannel.onopen = async () => {
        console.log("📡 Data channel open");
        const publicKey = await generateECDHKeyPair();
        console.log("🔑 Sending my public key:", publicKey);
        dataChannel.send(JSON.stringify({ type: "key", data: publicKey }));

        setInterval(() => {
        rotateCryptoKey();
        }, 10 * 60 * 1000);

    };

    dataChannel.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "key") {
        console.log("🔐 Received peer public key");

        if (!ecdhKeyPair) {
            console.log("🔄 Generating my new ECDH key pair in response...");
            await generateECDHKeyPair();
        }

        await deriveSharedKey(msg.data);
        console.log("✅ Shared key re-established");
        document.getElementById("sendButton").disabled = false;

        // 🔁 Send back my public key if this is a response to rotation
        if (msg.respond !== false) {
            const publicKey = await crypto.subtle.exportKey("jwk", ecdhKeyPair.publicKey);
            dataChannel.send(JSON.stringify({ type: "key", data: publicKey, respond: false }));
        }
    }
    else if (msg.type === "message") {
        if (!cryptoKey) {
            console.warn("⚠️ Cannot decrypt: shared key not ready");
            return;
        }
        const decrypted = await decryptMessage(msg.data);
        const sender = msg.username || "Peer";
        displayMessage(sender, decrypted);
    }
};



}


// === ECDH Key Exchange ===
async function generateECDHKeyPair() {
    ecdhKeyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true,
        ["deriveKey"]
    );
    return await crypto.subtle.exportKey("jwk", ecdhKeyPair.publicKey);
}

async function deriveSharedKey(peerPublicKeyJwk) {
    console.log("🔧 Deriving key from peer JWK:", peerPublicKeyJwk);
    const peerKey = await crypto.subtle.importKey(
        "jwk", peerPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, true, []
    );
    cryptoKey = await crypto.subtle.deriveKey(
        { name: "ECDH", public: peerKey },
        ecdhKeyPair.privateKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
    console.log("🔐 Derived shared cryptoKey:", cryptoKey);
}


// === AES-GCM Encrypt/Decrypt ===
async function encryptMessage(message) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(message);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, cryptoKey, encoded
    );
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(ciphertext)) };
}

async function decryptMessage(payload) {
    const iv = new Uint8Array(payload.iv);
    const data = new Uint8Array(payload.data);
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv }, cryptoKey, data
    );
    return new TextDecoder().decode(decrypted);
}

// === Message Sending ===
// === Message sending ===
async function sendMessage() {
    const input = document.getElementById("messageInput");
    const msg = input.value.trim();
    if (!msg) return;

    if (!cryptoKey) {
        alert("🔐 Shared encryption key is not established yet.");
        return;
    }

    if (!dataChannel || dataChannel.readyState !== "open") {
        alert("🔌 Data channel is not connected.");
        return;
    }

    const encrypted = await encryptMessage(msg);
    dataChannel.send(JSON.stringify({ type: "message", username: localUsername, data: encrypted}));

    displayMessage("You", msg);
    input.value = '';
}

// === Chat UI ===
function displayMessage(sender, text) {
    const chatBox = document.getElementById("chatBox");
    if (!chatBox) {
        console.error("⚠️ chatBox element not found in HTML.");
        return;
    }

    const p = document.createElement("p");
    p.textContent = `${sender}: ${text}`;
    chatBox.appendChild(p);
}

// === One-time setup when page loads ===
window.onload = () => {
    const input = document.getElementById("messageInput");
    input.focus();

    input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault(); // prevent form submit
            sendMessage();
        }
    });

    checkKeyReady(); // if you’re using it
};
