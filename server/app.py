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


class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # 'income' or 'expense'
    name = db.Column(db.String(80), nullable=False)
    color = db.Column(db.String(7), nullable=False)


class Subscription(db.Model):
    __tablename__ = 'subscriptions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    type = db.Column(db.String(10), nullable=False)  # 'income' or 'expense'
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    frequency = db.Column(db.String(10), nullable=False)  # 'weekly', 'monthly', 'yearly'
    start_date = db.Column(db.Date, nullable=False)
    active = db.Column(db.Boolean, default=True)


class Budget(db.Model):
    __tablename__ = 'budgets'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    category = db.Column(db.String(80), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)


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


@app.route('/api/entries/<int:entry_id>', methods=['PUT'])
@login_required
def update_entry(entry_id):
    e = Entry.query.get(entry_id)
    if not e or e.user_id != request.user_id:
        return jsonify({'error': 'not found'}), 404
    
    data = request.get_json() or {}
    
    # Update fields if provided
    if 'type' in data:
        t = data['type']
        if t not in ('income', 'expense'):
            return jsonify({'error': 'invalid type'}), 400
        e.type = t
    
    if 'description' in data:
        e.description = data['description'].strip() or e.description
    
    if 'amount' in data:
        try:
            e.amount = float(data['amount'])
        except Exception:
            return jsonify({'error': 'amount must be numeric'}), 400
    
    if 'category' in data:
        e.category = data['category'].strip() or e.category
    
    if 'date' in data:
        try:
            # Handle both ISO format and simple date strings
            date_str = data['date']
            if isinstance(date_str, str):
                # Remove timezone info and parse
                date_str = date_str.replace('Z', '+00:00')
                e.date = datetime.datetime.fromisoformat(date_str)
            else:
                return jsonify({'error': 'date must be a string'}), 400
        except Exception as ex:
            print(f"Date parsing error: {ex}, input: {data.get('date')}")
            return jsonify({'error': f'invalid date format: {str(ex)}'}), 400
    
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


@app.route('/api/profile/password', methods=['PUT'])
@login_required
def change_password():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404
    
    data = request.get_json() or {}
    current_password = data.get('currentPassword', '')
    new_password = data.get('newPassword', '')
    
    if not current_password or not new_password:
        return jsonify({'error': 'Current password and new password are required'}), 400
    
    if not user.verify_password(current_password):
        return jsonify({'error': 'Current password is incorrect'}), 401
    
    if len(new_password) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400
    
    user.set_password(new_password)
    db.session.commit()
    
    return jsonify({'ok': True, 'message': 'Password updated successfully'})


@app.route('/api/profile', methods=['DELETE'])
@login_required
def delete_account():
    user = User.query.get(request.user_id)
    if not user:
        return jsonify({'error': 'not found'}), 404
    
    # Delete all user's data
    Entry.query.filter_by(user_id=user.id).delete()
    Category.query.filter_by(user_id=user.id).delete()
    Subscription.query.filter_by(user_id=user.id).delete()
    Budget.query.filter_by(user_id=user.id).delete()
    
    # Delete the user
    db.session.delete(user)
    db.session.commit()
    
    return jsonify({'ok': True, 'message': 'Account deleted successfully'})


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


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@login_required
def admin_update_user(user_id):
    user = User.query.get(request.user_id)
    if not user or not user.is_admin:
        return jsonify({'error': 'admin access required'}), 403
    
    target_user = User.query.get(user_id)
    if not target_user:
        return jsonify({'error': 'user not found'}), 404
    
    data = request.get_json() or {}
    
    if 'username' in data:
        new_username = data['username'].strip()
        if not new_username:
            return jsonify({'error': 'username cannot be empty'}), 400
        
        # Check if username already exists
        existing = User.query.filter_by(username=new_username).first()
        if existing and existing.id != user_id:
            return jsonify({'error': 'username already exists'}), 400
        
        target_user.username = new_username
    
    db.session.commit()
    return jsonify({'ok': True})


# Categories endpoints
@app.route('/api/categories', methods=['GET'])
@login_required
def get_categories():
    categories = Category.query.filter_by(user_id=request.user_id).all()
    result = {'expense': [], 'income': []}
    for cat in categories:
        result[cat.type].append({'name': cat.name, 'color': cat.color})
    return jsonify(result)


@app.route('/api/categories', methods=['POST'])
@login_required
def add_category():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    cat_type = data.get('type')
    color = data.get('color', '#6ee7b7')
    
    if not name or cat_type not in ('income', 'expense'):
        return jsonify({'error': 'name and type are required'}), 400
    
    # Check if category already exists
    existing = Category.query.filter_by(user_id=request.user_id, type=cat_type, name=name).first()
    if existing:
        return jsonify({'error': 'category already exists'}), 400
    
    cat = Category(user_id=request.user_id, type=cat_type, name=name, color=color)
    db.session.add(cat)
    db.session.commit()
    return jsonify({'ok': True, 'id': cat.id})


@app.route('/api/categories/<int:category_id>', methods=['DELETE'])
@login_required
def delete_category(category_id):
    # Support query params for name-based deletion
    name = request.args.get('name')
    cat_type = request.args.get('type')
    
    if name and cat_type:
        cat = Category.query.filter_by(user_id=request.user_id, name=name, type=cat_type).first()
    else:
        cat = Category.query.get(category_id)
        if cat and cat.user_id != request.user_id:
            return jsonify({'error': 'not found'}), 404
    
    if not cat:
        return jsonify({'error': 'not found'}), 404
    
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/categories/<int:category_id>', methods=['PUT'])
@login_required
def update_category(category_id):
    data = request.get_json() or {}
    name = data.get('name')
    cat_type = data.get('type')
    old_name = data.get('oldName')
    
    # Support name-based update (for finding the category to update)
    if old_name and cat_type:
        # Updating an existing category by its old name
        cat = Category.query.filter_by(user_id=request.user_id, name=old_name, type=cat_type).first()
    elif name and cat_type:
        # Updating by current name (for color changes)
        cat = Category.query.filter_by(user_id=request.user_id, name=name, type=cat_type).first()
    else:
        cat = Category.query.get(category_id)
        if cat and cat.user_id != request.user_id:
            return jsonify({'error': 'not found'}), 404
    
    if not cat:
        return jsonify({'error': 'not found'}), 404
    
    # Update name if provided and different from old name
    if 'name' in data and name != old_name:
        # Check if new name already exists
        existing = Category.query.filter_by(user_id=request.user_id, name=name, type=cat_type).first()
        if existing and existing.id != cat.id:
            return jsonify({'error': 'Category name already exists'}), 400
        
        # Update all entries that use the old category name
        Entry.query.filter_by(user_id=request.user_id, category=old_name, type=cat_type).update({'category': name})
        
        # Update the category name
        cat.name = name
    
    # Update color if provided
    if 'color' in data:
        cat.color = data['color']
    
    db.session.commit()
    return jsonify({'ok': True})


# Subscriptions endpoints
@app.route('/api/subscriptions', methods=['GET'])
@login_required
def get_subscriptions():
    subs = Subscription.query.filter_by(user_id=request.user_id).all()
    result = []
    for sub in subs:
        result.append({
            'id': sub.id,
            'type': sub.type,
            'amount': float(sub.amount),
            'category': sub.category,
            'description': sub.description,
            'frequency': sub.frequency,
            'startDate': sub.start_date.isoformat(),
            'active': sub.active
        })
    return jsonify(result)


@app.route('/api/subscriptions', methods=['POST'])
@login_required
def add_subscription():
    data = request.get_json() or {}
    sub_type = data.get('type')
    amount = data.get('amount')
    category = data.get('category', '').strip()
    description = data.get('description', '').strip()
    frequency = data.get('frequency')
    start_date_str = data.get('startDate')
    
    if sub_type not in ('income', 'expense') or not amount or not category or not description or frequency not in ('weekly', 'monthly', 'yearly'):
        return jsonify({'error': 'invalid data'}), 400
    
    try:
        amount = float(amount)
        start_date = datetime.datetime.fromisoformat(start_date_str).date()
    except Exception:
        return jsonify({'error': 'invalid amount or date'}), 400
    
    sub = Subscription(user_id=request.user_id, type=sub_type, amount=amount, category=category,
                      description=description, frequency=frequency, start_date=start_date, active=True)
    db.session.add(sub)
    db.session.commit()
    return jsonify({'ok': True, 'id': sub.id})


@app.route('/api/subscriptions/<int:sub_id>', methods=['DELETE'])
@login_required
def delete_subscription(sub_id):
    sub = Subscription.query.get(sub_id)
    if not sub or sub.user_id != request.user_id:
        return jsonify({'error': 'not found'}), 404
    db.session.delete(sub)
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/subscriptions/<int:sub_id>', methods=['PUT'])
@login_required
def update_subscription(sub_id):
    sub = Subscription.query.get(sub_id)
    if not sub or sub.user_id != request.user_id:
        return jsonify({'error': 'not found'}), 404
    
    data = request.get_json() or {}
    
    if 'type' in data:
        if data['type'] not in ('income', 'expense'):
            return jsonify({'error': 'invalid type'}), 400
        sub.type = data['type']
    
    if 'amount' in data:
        try:
            sub.amount = float(data['amount'])
        except Exception:
            return jsonify({'error': 'invalid amount'}), 400
    
    if 'category' in data:
        sub.category = data['category'].strip() or sub.category
    
    if 'description' in data:
        sub.description = data['description'].strip() or sub.description
    
    if 'frequency' in data:
        if data['frequency'] not in ('weekly', 'monthly', 'yearly'):
            return jsonify({'error': 'invalid frequency'}), 400
        sub.frequency = data['frequency']
    
    if 'startDate' in data:
        try:
            sub.start_date = datetime.datetime.fromisoformat(data['startDate']).date()
        except Exception:
            return jsonify({'error': 'invalid date'}), 400
    
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/subscriptions/<int:sub_id>/toggle', methods=['POST'])
@login_required
def toggle_subscription(sub_id):
    sub = Subscription.query.get(sub_id)
    if not sub or sub.user_id != request.user_id:
        return jsonify({'error': 'not found'}), 404
    sub.active = not sub.active
    db.session.commit()
    return jsonify({'ok': True, 'active': sub.active})


# Budgets endpoints
@app.route('/api/budgets', methods=['GET'])
@login_required
def get_budgets():
    budgets = Budget.query.filter_by(user_id=request.user_id).all()
    result = []
    for b in budgets:
        result.append({
            'category': b.category,
            'amount': float(b.amount)
        })
    return jsonify(result)


@app.route('/api/budgets', methods=['POST'])
@login_required
def set_budget():
    data = request.get_json() or {}
    category = data.get('category', '').strip()
    amount = data.get('amount')
    
    if not category or not amount:
        return jsonify({'error': 'category and amount are required'}), 400
    
    try:
        amount = float(amount)
    except Exception:
        return jsonify({'error': 'invalid amount'}), 400
    
    # Update or create budget
    budget = Budget.query.filter_by(user_id=request.user_id, category=category).first()
    if budget:
        budget.amount = amount
    else:
        budget = Budget(user_id=request.user_id, category=category, amount=amount)
        db.session.add(budget)
    
    db.session.commit()
    return jsonify({'ok': True})


@app.route('/api/budgets/<string:category>', methods=['DELETE'])
@login_required
def delete_budget(category):
    budget = Budget.query.filter_by(user_id=request.user_id, category=category).first()
    if not budget:
        return jsonify({'error': 'not found'}), 404
    db.session.delete(budget)
    db.session.commit()
    return jsonify({'ok': True})




# Serve static frontend files and index.html for non-API routes
from flask import send_from_directory

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path.startswith('api/'):
        abort(404)
    static_dir = os.path.join(app.root_path, 'static')
    if path and os.path.exists(os.path.join(static_dir, path)):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, 'login.html')
