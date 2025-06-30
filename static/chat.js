const socket = io();
const username = "{{ username }}";
const room = "{{ room }}";

socket.emit("join", { username, room });

socket.on("receive_message", data => {
    const chat = document.getElementById("chat");
    chat.innerHTML += `<p><strong>${data.username}:</strong> ${data.message}</p>`;
});

socket.on("user_count", data => {
    document.getElementById("user-count").innerText = `Users in room: ${data.count}`;
});

function sendMessage() {
    const input = document.getElementById("message");
    const message = input.value;
    socket.emit("send_message", { username, room, message });
    input.value = "";
}

window.onbeforeunload = () => {
    socket.emit("leave", { username, room });
};
