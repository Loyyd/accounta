import ipaddress
from flask import abort, g, request

from extensions import db
from models import User


def get_json_body():
    return request.get_json(silent=True) or {}


def is_tailscale_request():
    ip_str = request.remote_addr
    if not ip_str:
        return False
    try:
        ip = ipaddress.ip_address(ip_str)
        # Tailscale IP range is 100.64.0.0/10
        tailscale_net = ipaddress.ip_network("100.64.0.0/10")
        return ip in tailscale_net or ip.is_loopback
    except ValueError:
        return False


def get_user_or_404(user_id):
    user = db.session.get(User, user_id)
    if not user:
        abort(404, description="not found")
    return user


def get_current_user():
    return get_user_or_404(g.user_id)


def require_admin():
    user = get_current_user()
    if not user.is_admin:
        abort(403, description="admin access required")
    return user
