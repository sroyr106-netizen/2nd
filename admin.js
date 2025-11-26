// Global Variables
let modelsLoaded = false;
let currentStream = null;
let scanStream = null;
let capturedDescriptor = null;
let currentFacingMode = 'user';
let scanFacingMode = 'user';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    initializeAdmin();
});

// Theme Management
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.querySelector('.theme-toggle-slider').textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.querySelector('.theme-toggle-slider').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

// Initialize Admin
function initializeAdmin() {
    const adminCreds = localStorage.getItem('adminCredentials');
    if (!adminCreds) {
        localStorage.setItem('adminCredentials', JSON.stringify({
            username: 'admin',
            password: 'admin123'
        }));
    }
}

// Login
function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const adminCreds = JSON.parse(localStorage.getItem('adminCredentials'));

    if (username === adminCreds.username && password === adminCreds.password) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboard').classList.add('active');
        document.querySelector('.btn-logout').classList.remove('hidden');
        loadFaceModels();
        loadSubjects();
        loadRecords();
    } else {
        showAlert('loginAlert', 'Invalid credentials', 'error');
    }
}

function logout() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('dashboard').classList.remove('active');
    document.querySelector('.btn-logout').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    stopCamera();
    stopScanCamera();
}

// Tab Switching
function switchTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tab + 'Section').classList.add('active');

    if (tab === 'register') {
        if (modelsLoaded) startCamera();
    } else {
        stopCamera();
    }

    if (tab === 'scan') {
        startScanCamera();
    } else {
        stopScanCamera();
    }

    if (tab === 'records') {
        loadRecords();
    }

    if (tab === 'manageStudents') {
        loadStudents();
    }
}

// Face-API.js Models
async function loadFaceModels() {
    document.getElementById('modelsLoading').classList.add('show');
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        modelsLoaded = true;
        document.getElementById('modelsLoading').classList.remove('show');
        document.getElementById('registerForm').classList.remove('hidden');
        startCamera();
    } catch (error) {
        showAlert('registerAlert', 'Failed to load face recognition models', 'error');
        console.error(error);
    }
}

// Camera Management
async function startCamera() {
    try {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode }
        });
        document.getElementById('video').srcObject = currentStream;
    } catch (error) {
        showAlert('registerAlert', 'Camera access denied', 'error');
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
}

function switchCamera() {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
}

async function startScanCamera() {
    try {
        if (scanStream) {
            scanStream.getTracks().forEach(track => track.stop());
        }
        scanStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: scanFacingMode }
        });
        document.getElementById('scanVideo').srcObject = scanStream;
    } catch (error) {
        showAlert('scanAlert', 'Camera access denied', 'error');
    }
}

function stopScanCamera() {
    if (scanStream) {
        scanStream.getTracks().forEach(track => track.stop());
        scanStream = null;
    }
}

function switchScanCamera() {
    scanFacingMode = scanFacingMode === 'user' ? 'environment' : 'user';
    startScanCamera();
}

// Capture Photo
async function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('captureCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    try {
        const detections = await faceapi.detectSingleFace(canvas)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detections) {
            capturedDescriptor = detections.descriptor;
            showAlert('registerAlert', 'Face captured successfully! ✅', 'success');
        } else {
            showAlert('registerAlert', 'No face detected. Please try again.', 'error');
        }
    } catch (error) {
        showAlert('registerAlert', 'Error detecting face', 'error');
    }
}

// Register Student
async function registerStudent(e) {
    e.preventDefault();

    if (!capturedDescriptor) {
        showAlert('registerAlert', 'Please capture face first', 'error');
        return;
    }

    const studentData = {
        id: Date.now().toString(),
        name: document.getElementById('studentName').value,
        collegeId: document.getElementById('collegeId').value,
        rollNumber: document.getElementById('rollNumber').value,
        registeredDate: new Date().toISOString().split('T')[0]
    };

    // Save to localStorage
    let students = JSON.parse(localStorage.getItem('students') || '[]');
    students.push(studentData);
    localStorage.setItem('students', JSON.stringify(students));

    // Save face descriptor to IndexedDB
    await saveFaceDescriptor(studentData.id, capturedDescriptor);

    showAlert('registerAlert', `Student ${studentData.name} registered successfully! 🎉`, 'success');

    // Reset form
    document.getElementById('studentName').value = '';
    document.getElementById('collegeId').value = '';
    document.getElementById('rollNumber').value = '';
    capturedDescriptor = null;
}

// IndexedDB for Face Descriptors
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('FaceAttendanceDB', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('faceDescriptors')) {
                db.createObjectStore('faceDescriptors', { keyPath: 'studentId' });
            }
        };
    });
}

async function saveFaceDescriptor(studentId, descriptor) {
    const db = await openDB();
    const tx = db.transaction('faceDescriptors', 'readwrite');
    const store = tx.objectStore('faceDescriptors');
    await store.put({ studentId, descriptor: Array.from(descriptor) });
}

async function getAllFaceDescriptors() {
    const db = await openDB();
    const tx = db.transaction('faceDescriptors', 'readonly');
    const store = tx.objectStore('faceDescriptors');
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteFaceDescriptor(studentId) {
    const db = await openDB();
    const tx = db.transaction('faceDescriptors', 'readwrite');
    const store = tx.objectStore('faceDescriptors');
    return new Promise((resolve, reject) => {
        const request = store.delete(studentId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Subject Management
function loadSubjects() {
    const subjects = JSON.parse(localStorage.getItem('subjects') || '[]');
    const subjectList = document.getElementById('subjectList');
    const scanSubject = document.getElementById('scanSubject');
    const filterSubject = document.getElementById('filterSubject');

    subjectList.innerHTML = '';
    scanSubject.innerHTML = '<option value="">-- Select Subject --</option>';
    filterSubject.innerHTML = '<option value="">All Subjects</option>';

    subjects.forEach(subject => {
        // List view
        const item = document.createElement('div');
        item.className = 'subject-item';
        item.innerHTML = `
            <span class="subject-name">${subject}</span>
            <button class="btn-delete" onclick="deleteSubject('${subject}')">Delete</button>
        `;
        subjectList.appendChild(item);

        // Dropdowns
        scanSubject.innerHTML += `<option value="${subject}">${subject}</option>`;
        filterSubject.innerHTML += `<option value="${subject}">${subject}</option>`;
    });

    if (subjects.length === 0) {
        subjectList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No subjects added yet</p>';
    }
}

function addSubject(e) {
    e.preventDefault();
    const subjectName = document.getElementById('subjectName').value.trim();

    let subjects = JSON.parse(localStorage.getItem('subjects') || '[]');

    if (subjects.includes(subjectName)) {
        showAlert('subjectsAlert', 'Subject already exists', 'error');
        return;
    }

    subjects.push(subjectName);
    localStorage.setItem('subjects', JSON.stringify(subjects));

    showAlert('subjectsAlert', `Subject "${subjectName}" added successfully! ✅`, 'success');
    document.getElementById('subjectName').value = '';
    loadSubjects();
}

function deleteSubject(subjectName) {
    if (!confirm(`Delete subject "${subjectName}"?`)) return;

    let subjects = JSON.parse(localStorage.getItem('subjects') || '[]');
    subjects = subjects.filter(s => s !== subjectName);
    localStorage.setItem('subjects', JSON.stringify(subjects));

    showAlert('subjectsAlert', `Subject "${subjectName}" deleted`, 'success');
    loadSubjects();
}

// Scan Attendance
async function scanFace() {
    const subject = document.getElementById('scanSubject').value;

    if (!subject) {
        showAlert('scanAlert', 'Please select a subject first', 'error');
        return;
    }

    const video = document.getElementById('scanVideo');

    try {
        const detections = await faceapi.detectSingleFace(video)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detections) {
            showAlert('scanAlert', 'No face detected', 'error');
            return;
        }

        const scannedDescriptor = detections.descriptor;
        const allDescriptors = await getAllFaceDescriptors();
        const students = JSON.parse(localStorage.getItem('students') || '[]');

        let matchedStudent = null;
        let minDistance = 0.6; // Threshold

        for (const desc of allDescriptors) {
            const distance = faceapi.euclideanDistance(scannedDescriptor, desc.descriptor);
            if (distance < minDistance) {
                minDistance = distance;
                matchedStudent = students.find(s => s.id === desc.studentId);
            }
        }

        if (matchedStudent) {
            // Record attendance
            const now = new Date();
            const attendance = {
                id: Date.now().toString(),
                studentId: matchedStudent.id,
                subject: subject,
                date: now.toISOString().split('T')[0],
                time: now.toTimeString().split(' ')[0],
                status: 'present'
            };

            let attendanceRecords = JSON.parse(localStorage.getItem('attendance') || '[]');
            attendanceRecords.push(attendance);
            localStorage.setItem('attendance', JSON.stringify(attendanceRecords));

            showAlert('scanAlert', `✅ Attendance marked for ${matchedStudent.name} (${subject})`, 'success');
        } else {
            showAlert('scanAlert', 'Face not recognized. Please register first.', 'error');
        }
    } catch (error) {
        showAlert('scanAlert', 'Error scanning face', 'error');
        console.error(error);
    }
}

// Records Management
function loadRecords() {
    const attendance = JSON.parse(localStorage.getItem('attendance') || '[]');
    const students = JSON.parse(localStorage.getItem('students') || '[]');
    const tbody = document.getElementById('recordsBody');

    if (attendance.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No records found</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    attendance.reverse().forEach(record => {
        const student = students.find(s => s.id === record.studentId);
        if (student) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.date}</td>
                <td>${record.time}</td>
                <td>${student.name}</td>
                <td>${student.collegeId}</td>
                <td>${student.rollNumber}</td>
                <td>${record.subject}</td>
            `;
            tbody.appendChild(row);
        }
    });
}

function filterRecords() {
    const subjectFilter = document.getElementById('filterSubject').value;
    const dateFilter = document.getElementById('filterDate').value;
    const searchQuery = document.getElementById('searchStudent').value.toLowerCase();

    const attendance = JSON.parse(localStorage.getItem('attendance') || '[]');
    const students = JSON.parse(localStorage.getItem('students') || '[]');
    const tbody = document.getElementById('recordsBody');

    let filtered = attendance.filter(record => {
        const student = students.find(s => s.id === record.studentId);
        if (!student) return false;

        const matchSubject = !subjectFilter || record.subject === subjectFilter;
        const matchDate = !dateFilter || record.date === dateFilter;
        const matchSearch = !searchQuery ||
            student.name.toLowerCase().includes(searchQuery) ||
            student.collegeId.toLowerCase().includes(searchQuery) ||
            student.rollNumber.toLowerCase().includes(searchQuery);

        return matchSubject && matchDate && matchSearch;
    });

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No matching records</td></tr>';
        return;
    }

    filtered.reverse().forEach(record => {
        const student = students.find(s => s.id === record.studentId);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.date}</td>
            <td>${record.time}</td>
            <td>${student.name}</td>
            <td>${student.collegeId}</td>
            <td>${student.rollNumber}</td>
            <td>${record.subject}</td>
        `;
        tbody.appendChild(row);
    });
}

// Export Functions
function getFilteredData() {
    const rows = document.querySelectorAll('#recordsBody tr');
    const data = [];
    rows.forEach(row => {
        if (row.cells.length > 1) {
            data.push({
                date: row.cells[0].textContent,
                time: row.cells[1].textContent,
                name: row.cells[2].textContent,
                collegeId: row.cells[3].textContent,
                rollNumber: row.cells[4].textContent,
                subject: row.cells[5].textContent
            });
        }
    });
    return data;
}

function copyRecords() {
    const data = getFilteredData();
    if (data.length === 0) {
        alert('No records to copy');
        return;
    }

    let text = 'Date\tTime\tName\tCollege ID\tRoll Number\tSubject\n';
    data.forEach(row => {
        text += `${row.date}\t${row.time}\t${row.name}\t${row.collegeId}\t${row.rollNumber}\t${row.subject}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        alert('Records copied to clipboard! 📋');
    });
}

function exportExcel() {
    const data = getFilteredData();
    if (data.length === 0) {
        alert('No records to export');
        return;
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `attendance_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportPDF() {
    const data = getFilteredData();
    if (data.length === 0) {
        alert('No records to export');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Attendance Records', 14, 20);

    doc.setFontSize(10);
    let y = 35;

    doc.text('Date', 14, y);
    doc.text('Time', 40, y);
    doc.text('Name', 65, y);
    doc.text('College ID', 110, y);
    doc.text('Roll No', 145, y);
    doc.text('Subject', 175, y);

    y += 7;
    doc.line(14, y, 195, y);
    y += 5;

    data.forEach(row => {
        if (y > 280) {
            doc.addPage();
            y = 20;
        }
        doc.text(row.date, 14, y);
        doc.text(row.time, 40, y);
        doc.text(row.name.substring(0, 20), 65, y);
        doc.text(row.collegeId, 110, y);
        doc.text(row.rollNumber, 145, y);
        doc.text(row.subject.substring(0, 15), 175, y);
        y += 7;
    });

    doc.save(`attendance_${new Date().toISOString().split('T')[0]}.pdf`);
}

// Student Management Functions
function loadStudents() {
    const students = JSON.parse(localStorage.getItem('students') || '[]');
    const studentsList = document.getElementById('studentsList');
    const searchInput = document.getElementById('searchStudents');

    // Clear search on load
    if (searchInput) {
        searchInput.value = '';
    }

    displayStudents(students);
}

function displayStudents(students) {
    const studentsList = document.getElementById('studentsList');

    if (students.length === 0) {
        studentsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No students registered yet</p>';
        return;
    }

    studentsList.innerHTML = '';
    students.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-card';
        card.innerHTML = `
            <div class="student-card-header">
                <div class="student-info">
                    <div class="student-name">${student.name}</div>
                    <div class="student-detail"><strong>College ID:</strong> ${student.collegeId}</div>
                    <div class="student-detail"><strong>Roll Number:</strong> ${student.rollNumber}</div>
                    <div class="student-detail"><strong>Registered:</strong> ${student.registeredDate}</div>
                </div>
                <button class="btn-delete" onclick="deleteStudent('${student.id}', '${student.name}')">Delete</button>
            </div>
        `;
        studentsList.appendChild(card);
    });
}

function searchStudents() {
    const searchQuery = document.getElementById('searchStudents').value.toLowerCase();
    const students = JSON.parse(localStorage.getItem('students') || '[]');

    const filtered = students.filter(student => {
        return student.name.toLowerCase().includes(searchQuery) ||
            student.collegeId.toLowerCase().includes(searchQuery) ||
            student.rollNumber.toLowerCase().includes(searchQuery);
    });

    displayStudents(filtered);
}

async function deleteStudent(studentId, studentName) {
    if (!confirm(`Are you sure you want to delete ${studentName}?\n\nThis will also remove:\n• All attendance records\n• Face recognition data`)) {
        return;
    }

    try {
        // Remove from students list
        let students = JSON.parse(localStorage.getItem('students') || '[]');
        students = students.filter(s => s.id !== studentId);
        localStorage.setItem('students', JSON.stringify(students));

        // Remove all attendance records for this student
        let attendance = JSON.parse(localStorage.getItem('attendance') || '[]');
        attendance = attendance.filter(a => a.studentId !== studentId);
        localStorage.setItem('attendance', JSON.stringify(attendance));

        // Remove face descriptor from IndexedDB
        await deleteFaceDescriptor(studentId);

        showAlert('manageStudentsAlert', `Student ${studentName} deleted successfully!`, 'success');

        // Reload the students list
        loadStudents();
    } catch (error) {
        showAlert('manageStudentsAlert', 'Error deleting student', 'error');
        console.error(error);
    }
}

// Settings
function updateCredentials(e) {
    e.preventDefault();
    const newUsername = document.getElementById('newUsername').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showAlert('settingsAlert', 'Passwords do not match', 'error');
        return;
    }

    localStorage.setItem('adminCredentials', JSON.stringify({
        username: newUsername,
        password: newPassword
    }));

    showAlert('settingsAlert', 'Credentials updated successfully! Please login again.', 'success');

    setTimeout(() => {
        logout();
    }, 2000);
}

// Alert Helper
function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;
    setTimeout(() => {
        alert.classList.remove('show');
    }, 5000);
}
