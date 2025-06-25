from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')
@app.route('/lobby', methods=['GET', 'POST'])
def lobby():
    room_code = request.form.get('room_code') or "guest-room"
    username = request.form.get('username') or "guest"

    return render_template('lobby.html', username=username, room_code=room_code)


@app.route('/join', methods=['POST'])
def join():
    room_code = request.form.get('room_code') or "guest-room"
    username = request.form.get('username') or "guest"

    return redirect(url_for('rooms', room_code=room_code, username=username))

@app.route('/rooms/<room_code>')
def rooms(room_code):
    username = request.args.get('username', 'guest')
    return render_template('chat.html', room_code=room_code, username=username)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)
