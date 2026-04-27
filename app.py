"""
Marking Planner - Flask backend with multi-user support
"""
import os
import uuid
import json
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash

basedir = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'change-me-before-deploying')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(basedir, "marking_planner.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'login'

# ============== Models ==============

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)

class TimeSlot(db.Model):
    id = db.Column(db.String(32), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    day = db.Column(db.String(20), nullable=False)
    start = db.Column(db.String(5), nullable=False)
    end = db.Column(db.String(5), nullable=False)
    label = db.Column(db.String(200), default='')

class TaskType(db.Model):
    id = db.Column(db.String(32), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    time_per_script = db.Column(db.Integer, default=20)
    colour = db.Column(db.String(7), default='#4a90a4')

class SavedSchedule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    calendar_json = db.Column(db.Text, nullable=False)
    batches_json = db.Column(db.Text, nullable=False)
    summary_json = db.Column(db.Text, nullable=False)
    generated_at = db.Column(db.DateTime, default=datetime.utcnow)

class Batch(db.Model):
    id = db.Column(db.String(32), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    task_type_id = db.Column(db.String(32), nullable=False)
    num_scripts = db.Column(db.Integer, nullable=False)
    completed_scripts = db.Column(db.Integer, default=0)
    deadline = db.Column(db.String(10), nullable=False)
    override_time = db.Column(db.Integer, nullable=True)
    max_per_sitting = db.Column(db.Integer, default=5)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

with app.app_context():
    db.create_all()

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

def generate_id():
    return uuid.uuid4().hex

# ============== Auth Routes ==============

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        email = request.form.get('email', '').lower().strip()
        password = request.form.get('password', '')
        user = User.query.filter_by(email=email).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user, remember=True)
            return redirect(url_for('index'))
        flash('Invalid email or password.')
    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    if request.method == 'POST':
        email = request.form.get('email', '').lower().strip()
        name = request.form.get('name', '').strip()
        password = request.form.get('password', '')
        if not email or not name or not password:
            flash('All fields are required.')
        elif User.query.filter_by(email=email).first():
            flash('An account with that email already exists.')
        elif len(password) < 8:
            flash('Password must be at least 8 characters.')
        else:
            user = User(email=email, name=name, password_hash=generate_password_hash(password))
            db.session.add(user)
            db.session.flush()
            for t in _default_task_types(user.id):
                db.session.add(t)
            db.session.commit()
            login_user(user, remember=True)
            return redirect(url_for('index'))
    return render_template('register.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

def _default_task_types(user_id):
    defaults = [
        ('Essay', 25, '#4a90a4'),
        ('IO Recording', 15, '#7cb342'),
        ('HL Essay', 30, '#5e35b1'),
        ('Paper 1 Practice', 25, '#fb8c00'),
    ]
    return [TaskType(id=generate_id(), user_id=user_id, name=n, time_per_script=t, colour=c)
            for n, t, c in defaults]

# ============== Main Route ==============


@app.route('/dev-login')
def dev_login():
    if not app.debug:
        return 'Not found', 404
    dev_user = User.query.filter_by(email='dev@local').first()
    if not dev_user:
        dev_user = User(email='dev@local', name='Jessica Kraak',
                        password_hash=generate_password_hash('dev'))
        db.session.add(dev_user)
        db.session.flush()
        for t in _default_task_types(dev_user.id):
            db.session.add(t)
        db.session.commit()
    login_user(dev_user)
    return redirect(url_for('index'))

@app.route('/')
@login_required
def index():
    return render_template('index.html', user=current_user)

# ============== Weekly Template API ==============

@app.route('/api/weekly-template', methods=['GET'])
@login_required
def get_weekly_template():
    days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    result = {day: [] for day in days}
    for slot in TimeSlot.query.filter_by(user_id=current_user.id).all():
        result[slot.day].append({'id': slot.id, 'start': slot.start, 'end': slot.end, 'label': slot.label})
    return jsonify(result)

@app.route('/api/weekly-template', methods=['POST'])
@login_required
def add_time_slot():
    body = request.json
    day = body.get('day')
    if day not in ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:
        return jsonify({'error': 'Invalid day'}), 400
    slot = TimeSlot(id=generate_id(), user_id=current_user.id, day=day,
                    start=body.get('start'), end=body.get('end'), label=body.get('label', ''))
    db.session.add(slot)
    db.session.commit()
    return get_weekly_template()

@app.route('/api/weekly-template/<day>/<slot_id>', methods=['DELETE'])
@login_required
def delete_time_slot(day, slot_id):
    slot = TimeSlot.query.filter_by(id=slot_id, user_id=current_user.id).first()
    if slot:
        db.session.delete(slot)
        db.session.commit()
    return get_weekly_template()

# ============== Task Types API ==============

@app.route('/api/task-types', methods=['GET'])
@login_required
def get_task_types():
    return jsonify([_type_to_dict(t) for t in TaskType.query.filter_by(user_id=current_user.id).all()])

@app.route('/api/task-types', methods=['POST'])
@login_required
def add_task_type():
    body = request.json
    t = TaskType(id=generate_id(), user_id=current_user.id, name=body.get('name'),
                 time_per_script=int(body.get('timePerScript', 20)), colour=body.get('colour', '#4a90a4'))
    db.session.add(t)
    db.session.commit()
    return jsonify(_type_to_dict(t))

@app.route('/api/task-types/<task_id>', methods=['PUT'])
@login_required
def update_task_type(task_id):
    t = TaskType.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    body = request.json
    t.name = body.get('name', t.name)
    t.time_per_script = int(body.get('timePerScript', t.time_per_script))
    t.colour = body.get('colour', t.colour)
    db.session.commit()
    return jsonify(_type_to_dict(t))

@app.route('/api/task-types/<task_id>', methods=['DELETE'])
@login_required
def delete_task_type(task_id):
    t = TaskType.query.filter_by(id=task_id, user_id=current_user.id).first_or_404()
    db.session.delete(t)
    db.session.commit()
    return jsonify({'success': True})

def _type_to_dict(t):
    return {'id': t.id, 'name': t.name, 'timePerScript': t.time_per_script, 'colour': t.colour}

# ============== Batches API ==============

@app.route('/api/batches', methods=['GET'])
@login_required
def get_batches():
    return jsonify([_batch_to_dict(b) for b in
                    Batch.query.filter_by(user_id=current_user.id).order_by(Batch.created_at).all()])

@app.route('/api/batches', methods=['POST'])
@login_required
def add_batch():
    body = request.json
    b = Batch(id=generate_id(), user_id=current_user.id,
              task_type_id=body.get('taskTypeId'),
              num_scripts=int(body.get('numScripts', 0)),
              completed_scripts=0,
              deadline=body.get('deadline'),
              override_time=body.get('overrideTime'),
              max_per_sitting=int(body.get('maxPerSitting', 5)))
    db.session.add(b)
    db.session.commit()
    return jsonify(_batch_to_dict(b))

@app.route('/api/batches/<batch_id>', methods=['PUT'])
@login_required
def update_batch(batch_id):
    b = Batch.query.filter_by(id=batch_id, user_id=current_user.id).first_or_404()
    body = request.json
    b.num_scripts = int(body.get('numScripts', b.num_scripts))
    b.completed_scripts = int(body.get('completedScripts', b.completed_scripts))
    b.deadline = body.get('deadline', b.deadline)
    b.override_time = body.get('overrideTime')
    b.max_per_sitting = int(body.get('maxPerSitting', b.max_per_sitting))
    b.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(_batch_to_dict(b))

@app.route('/api/batches/<batch_id>', methods=['DELETE'])
@login_required
def delete_batch(batch_id):
    b = Batch.query.filter_by(id=batch_id, user_id=current_user.id).first_or_404()
    db.session.delete(b)
    db.session.commit()
    return jsonify({'success': True})

def _batch_to_dict(b):
    return {'id': b.id, 'taskTypeId': b.task_type_id, 'numScripts': b.num_scripts,
            'completedScripts': b.completed_scripts, 'deadline': b.deadline,
            'overrideTime': b.override_time, 'maxPerSitting': b.max_per_sitting,
            'createdAt': b.created_at.isoformat() if b.created_at else None}

# ============== Schedule Generation ==============

@app.route('/api/schedule', methods=['GET'])
@login_required
def get_saved_schedule():
    saved = SavedSchedule.query.filter_by(user_id=current_user.id).first()
    if not saved:
        return jsonify(None)
    stale = any(
        b.updated_at and b.updated_at > saved.generated_at
        for b in Batch.query.filter_by(user_id=current_user.id).all()
    )
    return jsonify({
        'calendar': json.loads(saved.calendar_json),
        'batches': json.loads(saved.batches_json),
        'summary': json.loads(saved.summary_json),
        'generatedAt': saved.generated_at.isoformat(),
        'stale': stale
    })

@app.route('/api/generate-schedule', methods=['POST'])
@login_required
def generate_schedule():
    slots_by_day = {}
    for slot in TimeSlot.query.filter_by(user_id=current_user.id).all():
        slots_by_day.setdefault(slot.day, []).append(
            {'id': slot.id, 'start': slot.start, 'end': slot.end, 'label': slot.label})

    task_types = {t.id: t for t in TaskType.query.filter_by(user_id=current_user.id).all()}
    batches = Batch.query.filter_by(user_id=current_user.id).all()

    today = datetime.now().date()
    week_monday = today - timedelta(days=today.weekday())

    available_slots = []
    for week_offset in range(12):
        for day_name in ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:
            day_date = week_monday + timedelta(weeks=week_offset, days=get_day_offset(day_name))
            if day_date < today:
                continue
            for slot in slots_by_day.get(day_name, []):
                available_slots.append({
                    'date': day_date.isoformat(), 'dayName': day_name,
                    'start': slot['start'], 'end': slot['end'], 'label': slot['label'],
                    'assignments': []
                })

    active_batches = []
    for batch in batches:
        remaining = batch.num_scripts - batch.completed_scripts
        if remaining <= 0:
            continue
        task_type = task_types.get(batch.task_type_id)
        time_per_script = batch.override_time or (task_type.time_per_script if task_type else 20)
        active_batches.append({
            'id': batch.id,
            'taskTypeName': task_type.name if task_type else 'Unknown',
            'colour': task_type.colour if task_type else '#cccccc',
            'remaining': remaining, 'deadline': batch.deadline,
            'maxPerSitting': batch.max_per_sitting, 'timePerScript': time_per_script,
            'impossible': False
        })

    active_batches.sort(key=lambda b: b['deadline'])
    total_scripts_remaining = sum(b['remaining'] for b in active_batches)
    total_hours = sum(b['remaining'] * b['timePerScript'] / 60 for b in active_batches)

    for batch in active_batches:
        deadline_date = datetime.fromisoformat(batch['deadline']).date()
        for slot in available_slots:
            if batch['remaining'] <= 0:
                break
            if datetime.fromisoformat(slot['date']).date() > deadline_date:
                continue
            existing = next((a for a in slot['assignments'] if a['batchId'] == batch['id']), None)
            current_count = existing['count'] if existing else 0
            if current_count >= batch['maxPerSitting']:
                continue
            duration = slot_duration_minutes(slot['start'], slot['end'])
            time_used = sum(a['count'] * a['timePerScript'] for a in slot['assignments'])
            scripts_that_fit = (duration - time_used) // batch['timePerScript']
            can_add = min(batch['remaining'], batch['maxPerSitting'] - current_count, max(0, scripts_that_fit))
            if can_add > 0:
                if existing:
                    existing['count'] += can_add
                else:
                    slot['assignments'].append({
                        'batchId': batch['id'], 'count': can_add,
                        'taskTypeName': batch['taskTypeName'], 'colour': batch['colour'],
                        'timePerScript': batch['timePerScript']
                    })
                batch['remaining'] -= can_add
        if batch['remaining'] > 0:
            batch['impossible'] = True

    calendar = {}
    for slot in available_slots:
        if slot['assignments']:
            key = slot['date']
            if key not in calendar:
                calendar[key] = {'date': slot['date'], 'dayName': slot['dayName'], 'slots': []}
            calendar[key]['slots'].append({
                'start': slot['start'], 'end': slot['end'],
                'label': slot['label'], 'assignments': slot['assignments']
            })

    nearest_deadline = min((b['deadline'] for b in active_batches), default=None)
    summary = {'totalRemaining': total_scripts_remaining,
               'totalHours': round(total_hours, 1), 'nearestDeadline': nearest_deadline}

    # Persist the schedule
    saved = SavedSchedule.query.filter_by(user_id=current_user.id).first()
    if saved:
        saved.calendar_json = json.dumps(calendar)
        saved.batches_json = json.dumps(active_batches)
        saved.summary_json = json.dumps(summary)
        saved.generated_at = datetime.utcnow()
    else:
        db.session.add(SavedSchedule(
            user_id=current_user.id,
            calendar_json=json.dumps(calendar),
            batches_json=json.dumps(active_batches),
            summary_json=json.dumps(summary)
        ))
    db.session.commit()

    generated_at = SavedSchedule.query.filter_by(user_id=current_user.id).first().generated_at
    return jsonify({'calendar': calendar, 'batches': active_batches, 'summary': summary,
                    'generatedAt': generated_at.isoformat()})


def slot_duration_minutes(start, end):
    sh, sm = map(int, start.split(':'))
    eh, em = map(int, end.split(':'))
    return (eh * 60 + em) - (sh * 60 + sm)


def get_day_offset(day_name):
    return {'Monday':0,'Tuesday':1,'Wednesday':2,'Thursday':3,'Friday':4,'Saturday':5,'Sunday':6}.get(day_name, 0)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
