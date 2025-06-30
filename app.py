from flask import Flask, render_template, request, redirect, url_for, jsonify
import time, hmac, hashlib, base64

app = Flask(__name__)
app.secret_key = 'supersecret'

TURN_SECRET = "yoursharedsecret"  # must match coturn config
REALM = "gojsi.cc"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/join', methods=['POST'])
def join():
    room_code = request.form.get('room_code') or 'guest'
    username = request.form.get('username') or 'guest'
    return redirect(url_for('room', room_code=room_code, username=username))

@app.route('/rooms/<room_code>')
def room(room_code):
    username = request.args.get('username', 'guest')
    return render_template('chat.html', room_code=room_code, username=username)

@app.route('/get-turn-creds')
def get_turn_creds():
    origin = request.headers.get("Origin", "")
    if not origin.startswith("https://gojsi.cc"):
        return jsonify({"error": "unauthorized"}), 401

    user = request.args.get("user", "guest")
    ttl = 3600
    timestamp = int(time.time()) + ttl
    username = f"{timestamp}:{user}"
    key = hmac.new(TURN_SECRET.encode(), username.encode(), hashlib.sha1)
    password = base64.b64encode(key.digest()).decode()

    return jsonify({
        "username": username,
        "password": password,
        "ttl": ttl
    })

# Launch Flask and signaling server together
import subprocess, sys, os
if __name__ == '__main__':
    subprocess.Popen([sys.executable, os.path.join(os.path.dirname(__file__), 'signaling.py')])
    app.run(host='0.0.0.0', port=5050)
