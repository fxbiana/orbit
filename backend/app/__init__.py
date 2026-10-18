from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from app.config import Config


def create_app(config_override: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)
    if config_override:
        app.config.update(config_override)

    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})

    from app.routes.health import bp as health_bp
    from app.routes.matches import bp as matches_bp
    from app.routes.onboarding import bp as onboarding_bp
    from app.routes.plans import bp as plans_bp
    from app.routes.tickets import bp as tickets_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(matches_bp)
    app.register_blueprint(onboarding_bp)
    app.register_blueprint(plans_bp)
    app.register_blueprint(tickets_bp)

    @app.errorhandler(HTTPException)
    def handle_http(err: HTTPException):
        return jsonify({"error": err.description or err.name}), err.code

    return app
