from flask import Blueprint, jsonify

from .models import Course

api = Blueprint("api", __name__)


@api.get("/courses")
def courses():
    return jsonify([c.to_dict() for c in Course.query.all()])