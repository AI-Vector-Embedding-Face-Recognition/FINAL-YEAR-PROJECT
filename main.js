/**
 * Edge-AI Biometric Authentication Engine - Production Stylesheet
 * Project: High-Dimensional Face Embedding System for Automated Attendance
 * 
 * Design System Specifications:
 * - Color Palette: Deep Slate Core (#0B0F19), Cyber Accent (#00F2FE), Clean Mono Slate (#1E293B)
 * - Typography: Space Grotesk (Geometric Sans-Serif optimized for data visualization)
 * - Layout Frameworks: CSS Grid and Flexbox for strict non-tabular alignment.
 */

:root {
  --bg-primary: #0F172A;
  --bg-surface: #1E293B;
  --bg-surface-elevated: #334155;
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --accent-cyan: #00F2FE;
  --accent-blue: #38BDF8;
  --state-success: #10B981;
  --state-warning: #F59E0B;
  --state-error: #EF4444;
  --radius-md: 8px;
  --radius-lg: 12px;
  --transition-smooth: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Base Document Reset & Setup */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Space Grotesk', sans-serif;
  line-height: 1.6;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* Semantic Container Layout */
main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 2rem;
}

/* Global Academic Header & Navigation */
.app-header {
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--bg-surface-elevated);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.header-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.25rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--text-primary);
  text-decoration: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.brand::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  background-color: var(--accent-cyan);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--accent-cyan);
}

.navigation-links {
  display: flex;
  gap: 1.5rem;
}

.navigation-links a {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.95rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  transition: var(--transition-smooth);
}

.navigation-links a:hover {
  color: var(--text-primary);
  background-color: var(--bg-surface-elevated);
}

.navigation-links a.active-route {
  color: var(--accent-cyan);
  background-color: rgba(0, 242, 254, 0.08);
  font-weight: 600;
}

/* Academic Presentation Banner (Hero Section) */
.hero-section {
  text-align: center;
  margin-bottom: 3.5rem;
}

h1 {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -1px;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, var(--text-primary) 30%, var(--accent-blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.lead {
  font-size: 1.1rem;
  color: var(--text-secondary);
  max-width: 800px;
  margin: 0 auto;
}

/* Operational Control Buttons Section */
.row {
  display: flex;
  justify-content: center;
  gap: 1.25rem;
  margin-bottom: 4rem;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.85rem 1.75rem;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition-smooth);
  border: none;
  background: linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%);
  color: #0F172A;
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.2);
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 242, 254, 0.35);
}

.btn.alt {
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--bg-surface-elevated);
  box-shadow: none;
}

.btn.alt:hover {
  background: var(--bg-surface-elevated);
  border-color: var(--text-secondary);
  color: var(--accent-cyan);
}

/* Analytical System Telemetry Metrics Block */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 4rem;
}

.card {
  background-color: var(--bg-surface);
  border: 1px solid var(--bg-surface-elevated);
  border-radius: var(--radius-lg);
  padding: 2rem;
  transition: var(--transition-smooth);
}

.card:hover {
  border-color: rgba(0, 242, 254, 0.3);
  transform: translateY(-2px);
}

.card.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  position: relative;
  overflow: hidden;
}

.card.stat::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--accent-cyan);
}

.card.stat b {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
  font-variant-numeric: tabular-nums;
}

.card.stat span {
  font-size: 0.95rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
}

/* Functional Processing Pipeline Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.grid .card h2 {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--accent-blue);
}

.grid .card p {
  font-size: 0.95rem;
  color: var(--text-secondary);
}

/* Asynchronous Component Runtime Indicators (Status Matrix) */
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.9rem;
  font-weight: 500;
}

.state-info { background: rgba(56, 189, 248, 0.1); color: var(--accent-blue); }
.state-success { background: rgba(16, 185, 129, 0.1); color: var(--state-success); }
.state-warning { background: rgba(245, 158, 11, 0.1); color: var(--state-warning); }
.state-error { background: rgba(239, 68, 68, 0.1); color: var(--state-error); }

/* System Toast Dispatcher Module */
#toast {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  background-color: #0B0F19;
  color: var(--text-primary);
  padding: 1rem 1.5rem;
  border-radius: var(--radius-md);
  border-left: 4px solid var(--accent-cyan);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  font-weight: 500;
  font-size: 0.95rem;
  transform: translateY(150%);
  opacity: 0;
  transition: var(--transition-smooth);
  z-index: 2000;
  pointer-events: none;
}

#toast.toast-active {
  transform: translateY(0);
  opacity: 1;
}

/* Responsive Adaptive Viewports */
@media (max-width: 768px) {
  h1 { font-size: 2rem; }
  .header-container { flex-direction: column; gap: 1rem; }
  main { padding: 2rem 1rem; }
}
