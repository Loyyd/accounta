import os
import datetime
from functools import wraps

from flask import Flask, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from passlib.hash import bcrypt
import jwt
from flask_cors import CORS

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret')
JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
JWT_EXP_SECONDS = int(os.getenv('JWT_EXP_SECONDS', '86400'))

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL or 'sqlite:///dev.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)

db = SQLAlchemy(app)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)

    def set_password(self, raw):
        self.password_hash = bcrypt.hash(raw[:72])

    def verify_password(self, raw):
        return bcrypt.verify(raw, self.password_hash)


class Entry(db.Model):
    __tablename__ = 'entries'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # 'income' or 'expense'
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    date = db.Column(db.DateTime, default=datetime.datetime.utcnow)


def create_token(user_id):
    payload = {
        'sub': user_id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=JWT_EXP_SECONDS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload['sub']
    except jwt.ExpiredSignatureError:
        abort(401, 'Token expired')
    except Exception:
        abort(401, 'Invalid token')


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', None)
        if not auth:
            abort(401, 'Authorization header required')
        parts = auth.split()
        if parts[0].lower() != 'bearer' or len(parts) != 2:
            abort(401, 'Invalid authorization header')
        token = parts[1]
        user_id = decode_token(token)
        request.user_id = user_id
        return f(*args, **kwargs)
    return decorated


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'username already exists'}), 400
    u = User(username=username)
    u.set_password(password)
    db.session.add(u)
    db.session.commit()
    token = create_token(u.id)
    return jsonify({'token': token, 'username': username})


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'error': 'username and password are required'}), 400
    user = User.query.filter_by(username=username).first()
    if not user or not user.verify_password(password):
        return jsonify({'error': 'invalid credentials'}), 401
    token = create_token(user.id)
    return jsonify({'token': token, 'username': username})


@app.route('/api/entries', methods=['GET'])
@login_required
def list_entries():
    user_id = request.user_id
    entries = Entry.query.filter_by(user_id=user_id).order_by(Entry.date.desc()).all()
    def to_json(e):
        return {
            'id': e.id,
            'type': e.type,
            'description': e.description,
            'amount': float(e.amount),
            'category': e.category,
            'date': e.date.isoformat()
        }
    return jsonify([to_json(e) for e in entries])


@app.route('/api/entries', methods=['POST'])
@login_required
def add_entry():
    data = request.get_json() or {}
    t = data.get('type')
    description = data.get('description', '').strip()
    amount = data.get('amount')
    category = data.get('category', '').strip() or 'Other'
    if t not in ('income', 'expense') or not description or amount is None:
        return jsonify({'error': 'type, description and amount are required'}), 400
    try:
        amount = float(amount)
    except Exception:
        return jsonify({'error': 'amount must be numeric'}), 400

    e = Entry(user_id=request.user_id, type=t, description=description, amount=amount, category=category)
    db.session.add(e)
    db.session.commit()
    return jsonify({'id': e.id})


@app.route('/api/entries/<int:entry_id>', methods=['DELETE'])
@login_required
def delete_entry(entry_id):
    e = Entry.query.get(entry_id)
    if not e or e.user_id != request.user_id:
        return jsonify({'error': 'not found'}), 404
    db.session.delete(e)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/ping')
def ping():
    return jsonify({'ok': True})


@app.route('/api/profile')
@login_required
def profile():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404
    return jsonify({'username': user.username, 'id': user.id})


if __name__ == '__main__':
    # Development server: create DB tables if missing
    with app.app_context():
        db.create_all()
    app.run(host='127.0.0.1', port=5000, debug=True)
