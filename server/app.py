import os
import datetime
from functools import wraps

from flask import Flask, request, jsonify, abort
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import bcrypt
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
    is_admin = db.Column(db.Boolean, default=False)

    def set_password(self, raw):
        # Hash password using bcrypt
        password_bytes = raw.encode('utf-8')
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password_bytes, salt)
        self.password_hash = hashed.decode('utf-8')

    def verify_password(self, raw):
        # Verify password using bcrypt
        password_bytes = raw.encode('utf-8')
        hash_bytes = self.password_hash.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hash_bytes)


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
        'sub': str(user_id),  # JWT 'sub' claim must be a string
        'exp': datetime.datetime.utcnow() + datetime.timedelta(seconds=JWT_EXP_SECONDS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return int(payload['sub'])  # Convert back to int for database query
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
    return jsonify({'token': token, 'username': username, 'is_admin': user.is_admin})
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
    description = data.get('description', '').strip() or (t.capitalize() if t else 'Transaction')
    amount = data.get('amount')
    category = data.get('category', '').strip() or 'Other'
    date_str = data.get('date')  # ISO date string from frontend
    
    if t not in ('income', 'expense') or amount is None:
        return jsonify({'error': 'type and amount are required'}), 400
    try:
        amount = float(amount)
    except Exception:
        return jsonify({'error': 'amount must be numeric'}), 400
    
    # Parse date if provided, otherwise use current time
    entry_date = datetime.datetime.utcnow()
    if date_str:
        try:
            entry_date = datetime.datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except Exception:
            pass  # Use default if date parsing fails

    e = Entry(user_id=request.user_id, type=t, description=description, amount=amount, category=category, date=entry_date)
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
    return jsonify({'username': user.username, 'id': user.id, 'is_admin': user.is_admin})


# Admin endpoints
@app.route('/api/admin/users', methods=['GET'])
@login_required
def admin_get_users():
    user = User.query.get(request.user_id)
    if not user or not user.is_admin:
        return jsonify({'error': 'admin access required'}), 403
    
    users = User.query.all()
    users_list = []
    for u in users:
        entry_count = Entry.query.filter_by(user_id=u.id).count()
        total_income = db.session.query(db.func.sum(Entry.amount)).filter_by(user_id=u.id, type='income').scalar() or 0
        total_expense = db.session.query(db.func.sum(Entry.amount)).filter_by(user_id=u.id, type='expense').scalar() or 0
        
        users_list.append({
            'id': u.id,
            'username': u.username,
            'is_admin': u.is_admin,
            'created_at': u.created_at.isoformat() if hasattr(u, 'created_at') and u.created_at else None,
            'entry_count': entry_count,
            'total_income': float(total_income),
            'total_expense': float(total_expense)
        })
    
    return jsonify({'users': users_list})


@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@login_required
def admin_delete_user(user_id):
    user = User.query.get(request.user_id)
    if not user or not user.is_admin:
        return jsonify({'error': 'admin access required'}), 403
    
    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({'error': 'user not found'}), 404
    
    # Prevent deleting yourself
    if target_user.id == user.id:
        return jsonify({'error': 'cannot delete yourself'}), 400
    
    db.session.delete(target_user)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/admin/users/<int:user_id>/toggle-admin', methods=['POST'])
@login_required
def admin_toggle_admin(user_id):
    user = User.query.get(request.user_id)
    if not user or not user.is_admin:
        return jsonify({'error': 'admin access required'}), 403
    
    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({'error': 'user not found'}), 404
    
    # Prevent removing your own admin status
    if target_user.id == user.id:
        return jsonify({'error': 'cannot modify your own admin status'}), 400
    
    target_user.is_admin = not target_user.is_admin
    db.session.commit()
    return jsonify({'ok': True, 'is_admin': target_user.is_admin})



if __name__ == '__main__':
    # Development server: create DB tables if missing
    with app.app_context():
        db.create_all()
    app.run(host='127.0.0.1', port=5000, debug=True)
