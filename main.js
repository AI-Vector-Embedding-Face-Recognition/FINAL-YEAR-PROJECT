/* Shared: storage, navigation, toast. Data lives in this browser (localStorage). */
const THRESHOLD = 0.5; // Euclidean distance: lower = same person. Tune with your own data.

const DB = {
  people: () => JSON.parse(localStorage.getItem('people') || '[]'), // {id,name,roll,embeddings:[[128 nums]...]}
  logs:   () => JSON.parse(localStorage.getItem('logs')   || '[]'), // {id,name,roll,date,time,distance}
  save:   (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  today:  () => new Date().toISOString().slice(0, 10)
};

function renderNav() {
  const pages = [['index.html','Home'],['register.html','Register face'],['attendance.html','Take attendance'],['records.html','Records & 2D map']];
  const here = location.pathname.split('/').pop() || 'index.html';
  document.getElementById('nav').innerHTML =
    `<header><div class="bar"><a class="brand" href="index.html">FaceVector Attendance</a><nav>` +
    pages.map(([h, t]) => `<a href="${h}" class="${h === here ? 'on' : ''}">${t}</a>`).join('') +
    `</nav></div></header>`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function setStatus(el, msg, type = '') { el.textContent = msg; el.className = 'status ' + type; }

document.addEventListener('DOMContentLoaded', renderNav);
