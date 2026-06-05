from routes.admin import bp as admin_bp
from routes.auth_routes import bp as auth_bp
from routes.categories import bp as categories_bp
from routes.entries import bp as entries_bp
from routes.frontend import bp as frontend_bp
from routes.meta import bp as meta_bp
from routes.profile import bp as profile_bp
from routes.pouches import bp as pouches_bp
from routes.subscriptions import bp as subscriptions_bp


def register_routes(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(entries_bp)
    app.register_blueprint(meta_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(subscriptions_bp)
    app.register_blueprint(pouches_bp)
    app.register_blueprint(frontend_bp)
