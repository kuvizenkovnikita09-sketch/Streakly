from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def create_app():
    # Сайт (html, css, js) лежит в папке frontend и отдаётся прямо с корня адреса
    app = Flask(__name__, static_folder="../frontend", static_url_path="")
    # SQLite: база это обычный файл, он создастся сам в папке instance/
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///streakly.db"

    db.init_app(app)

    from .api import api
    app.register_blueprint(api, url_prefix="/api")

    @app.route("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    with app.app_context():
        from .seed import seed_courses
        db.create_all()   # создаёт таблицы, если их ещё нет
        seed_courses()    # заполняет курсы, если таблица пустая

    return app