from werkzeug.security import check_password_hash, generate_password_hash

from . import db


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(40), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)  # настоящий хэш, не сам пароль

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Course(db.Model):
    id = db.Column(db.String(30), primary_key=True)  # например "pushups"
    title = db.Column(db.String(100), nullable=False)
    level = db.Column(db.String(20), nullable=False)
    description = db.Column(db.String(300), nullable=False)
    days = db.Column(db.Integer, nullable=False)
    sets = db.Column(db.Integer, nullable=False)
    reps_from = db.Column(db.Integer, nullable=False)  # норма в первый день
    reps_to = db.Column(db.Integer, nullable=False)    # норма в последний день
    unit = db.Column(db.String(10), default="раз")

    def to_dict(self):
        return {
            "id": self.id, "title": self.title, "level": self.level,
            "desc": self.description, "days": self.days, "sets": self.sets,
            "from": self.reps_from, "to": self.reps_to, "unit": self.unit,
        }


class Enrollment(db.Model):
    """Пользователь проходит курс. Одну и ту же пару (пользователь, курс) добавить дважды нельзя."""
    __table_args__ = (db.UniqueConstraint("user_id", "course_id"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    course_id = db.Column(db.String(30), db.ForeignKey("course.id"), nullable=False)
    start_date = db.Column(db.Date, nullable=False)

    reports = db.relationship("Report", backref="enrollment", cascade="all, delete-orphan")


class Report(db.Model):
    """Отчёт за один день: сколько повторений сделано в каждом подходе."""
    __table_args__ = (db.UniqueConstraint("enrollment_id", "day"),)

    id = db.Column(db.Integer, primary_key=True)
    enrollment_id = db.Column(db.Integer, db.ForeignKey("enrollment.id"), nullable=False)
    day = db.Column(db.Date, nullable=False)
    sets = db.Column(db.JSON, nullable=False)  # например [20, 20, 18]