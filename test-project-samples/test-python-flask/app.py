# Code Count Sample File (Python/Flask)
# ---------------------------------------------------------
# This file is used to verify line counting and discovery logic.
# [Test Points]:
# - Code: Standard Flask route and app initialization
# - Comments: Single-line headers and docstrings
# - Blank Lines: Structural spacing between functions
# ---------------------------------------------------------

from flask import Flask, render_template

# Initialize Flask App
app = Flask(__name__)

"""
Main route handler.
Tests multi-line docstrings and Python comments.
"""
@app.route('/')
def home():
    # Return a welcome message
    msg = "Welcome to the Python Sample!"
    return msg

if __name__ == '__main__':
    # Run the server
    app.run(debug=True)
