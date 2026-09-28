import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json({ limit: '10mb' }));

// Expose configuration if set
app.get('/api/config', (_req, res) => {
  res.json({
    firebaseApiKey: process.env.FIREBASE_API_KEY || '',
    hasServerGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

// Comprehensive AI Analyzer Fallback Engine
// Generates data-driven insights even if the external Gemini API is unreachable or rate-limited
function generateDynamicFallbackAnalysis(prompt, context) {
  const p = (prompt || '').toLowerCase();
  const stores = context?.stores || [];
  const team = context?.team || [];
  const tasks = context?.tasks || {};
  const activeTasks = tasks?.activeTasksList || [];
  const logs = context?.visitLogs || [];
  const content = context?.contentCreation || {};
  const contentProjects = content?.projectsList || [];

  // Overdue stores
  const overdueStores = stores.filter(s => s.cadenceStatus === 'Time for a Visit');
  const dueSoonStores = stores.filter(s => s.cadenceStatus === 'Due Soon');
  const onTrackStores = stores.filter(s => s.cadenceStatus === 'On Track');

  // Stalled or high priority content
  const prodProjects = contentProjects.filter(cp => cp.stage === 'production' || cp.stage === 'review');
  const highPrioContent = contentProjects.filter(cp => cp.priority === 'High');

  // Overdue tasks
  const overdueTasks = activeTasks.filter(t => t.isOverdue);

  if (p.includes('priorit') || p.includes('weekly') || p.includes('briefing') || p.includes('overview') || p.includes('analyze everything') || p.includes('what should i do')) {
    let result = `### 📊 Executive Platform Priority Briefing\n\n`;

    // 1. Store Cadence Urgency
    if (overdueStores.length > 0) {
      result += `**1. 🚨 Dealership Visit Urgency:**\n`;
      overdueStores.forEach(s => {
        result += `• **${s.name}** is **${s.daysSinceLastVisit} days** since your last walk (Rhythm: every ${s.cadenceRhythmDays}d). Scheduled staff: ${s.assignedStaff.join(', ') || 'Team'}.\n`;
      });
    } else if (dueSoonStores.length > 0) {
      result += `**1. ⚡ Upcoming Store Visit:**\n`;
      dueSoonStores.forEach(s => {
        result += `• **${s.name}** is due soon (${s.daysSinceLastVisit} days since last visit). Plan your stop this week.\n`;
      });
    } else {
      result += `**1. ✅ Store Visits:** All ${stores.length} dealership locations are currently on track.\n`;
    }

    // 2. High-Impact Tasks
    result += `\n**2. 📋 Critical Action Items:**\n`;
    if (overdueTasks.length > 0) {
      overdueTasks.forEach(t => {
        result += `• ⚠️ **Overdue:** "${t.text}" (${t.store}) - was due on ${t.dueDate}.\n`;
      });
    }
    const inFlight = activeTasks.filter(t => t.stage === 'in-flight').slice(0, 2);
    if (inFlight.length > 0) {
      inFlight.forEach(t => {
        result += `• 🛠️ **In Progress:** "${t.text}" (${t.store}) [${t.tag}].\n`;
      });
    }

    // 3. Training Content Production
    result += `\n**3. 🎬 Training Content Creation Priorities:**\n`;
    if (prodProjects.length > 0) {
      prodProjects.forEach(cp => {
        result += `• **${cp.title}** (${cp.format}): In **${cp.stage.toUpperCase()}** stage for **${cp.audience}** (${cp.progressPercent}). Incomplete: ${cp.incompleteMilestones?.slice(0, 2).join('; ') || 'Final approval'}.\n`;
      });
    } else {
      result += `• ${content.activeProjectsCount || 0} active modules in pipeline across ${content.totalProjects || 0} total training projects.\n`;
    }

    // 4. Coaching Focus
    result += `\n**4. 👥 Recommended 1-on-1 Coaching Stops:**\n`;
    team.slice(0, 2).forEach(e => {
      result += `• **${e.name}** (${e.role} @ ${e.storeName}): Focus on *"Today's Goal: ${e.currentCoachingGoal}"*. Pending drills: ${e.pendingDrills.map(d => d.text).join('; ') || 'Schedule floor observation'}.\n`;
    });

    return result;
  }

  if (p.includes('store') || p.includes('visit') || p.includes('location') || p.includes('where to go')) {
    let result = `### 🚗 Store Visit Cadence & Route Strategy\n\n`;
    result += `Here is the current visit rhythm across your **${stores.length} dealerships**:\n\n`;
    stores.forEach(s => {
      const statusIcon = s.cadenceStatus === 'Time for a Visit' ? '🚨' : s.cadenceStatus === 'Due Soon' ? '⚡' : '✅';
      result += `• ${statusIcon} **${s.name}** (${s.type}):\n`;
      result += `  - **Status:** ${s.cadenceStatus} (${s.daysSinceLastVisit} days ago, cadence target: every ${s.cadenceRhythmDays} days)\n`;
      result += `  - **Assigned Team:** ${s.assignedStaff.join(', ') || 'No staff assigned'}\n`;
      if (s.latestVisitLog) {
        result += `  - **Last Walk Takeaway (${s.latestVisitLog.date}):** "${s.latestVisitLog.notes}"\n`;
      }
    });

    if (overdueStores.length > 0) {
      result += `\n**Recommendation:** Head to **${overdueStores[0].name}** first. Prioritize shadowing on the showroom floor or service drive.`;
    }
    return result;
  }

  if (p.includes('content') || p.includes('training') || p.includes('module') || p.includes('video') || p.includes('script')) {
    let result = `### 🎬 Training Content Creation Pipeline\n\n`;
    result += `You currently have **${content.totalProjects || 0} training projects** (${content.publishedCount || 0} published, ${content.activeProjectsCount || 0} in active production):\n\n`;
    contentProjects.forEach(cp => {
      result += `• **${cp.title}** [${cp.priority} Priority]\n`;
      result += `  - Format: ${cp.format} | Target: ${cp.audience} (${cp.targetStore})\n`;
      result += `  - Stage: **${cp.stage.toUpperCase()}** | Progress: ${cp.progressPercent}\n`;
      result += `  - Target Launch: ${cp.targetDate || 'TBD'}\n`;
      if (cp.incompleteMilestones && cp.incompleteMilestones.length > 0) {
        result += `  - Next Milestone: ${cp.incompleteMilestones[0]}\n`;
      }
      result += `\n`;
    });
    return result;
  }

  if (p.includes('team') || p.includes('coach') || p.includes('drill') || p.includes('employee') || p.includes('people')) {
    let result = `### 👥 Team Member Coaching Dossier\n\n`;
    team.forEach(e => {
      result += `• **${e.name}** — ${e.role} @ **${e.storeName}**\n`;
      result += `  - **Current Focus:** "${e.currentCoachingGoal}"\n`;
      if (e.pendingDrills.length > 0) {
        result += `  - **Active Drills to Run:** ${e.pendingDrills.map(d => d.text).join('; ')}\n`;
      }
      if (e.recentDebriefNotes.length > 0) {
        result += `  - **Recent Coaching Note (${e.recentDebriefNotes[0].date}):** "${e.recentDebriefNotes[0].notes}"\n`;
      }
      result += `\n`;
    });
    return result;
  }

  if (p.includes('log') || p.includes('history') || p.includes('walks')) {
    let result = `### 📋 Recent Store Visit History & Observations\n\n`;
    if (logs.length === 0) {
      result += `No visit logs recorded yet. Click "Log Walk" on any store card to save your observations.\n`;
    } else {
      logs.slice(0, 5).forEach(v => {
        result += `• **${v.date} — ${v.store}** (${v.visitType}):\n`;
        result += `  - **Focus:** ${v.focus}\n`;
        result += `  - **Staff Coached:** ${(v.staffCoached || []).join(', ') || 'All Team'}\n`;
        result += `  - **Observations:** "${v.observationsAndTakeaways}"\n\n`;
      });
    }
    return result;
  }

  // General grounded synthesis
  let result = `### ⚡ Cadence Dealership Analysis\n\n`;
  result += `Here is your current operational snapshot:\n\n`;
  result += `• **Stores:** ${stores.length} total (${overdueStores.length} overdue, ${dueSoonStores.length} due soon, ${onTrackStores.length} on track)\n`;
  result += `• **Team:** ${team.length} specialists coached across ${logs.length} logged visits\n`;
  result += `• **Tasks:** ${activeTasks.length} active action items (${overdueTasks.length} overdue)\n`;
  result += `• **Training Content:** ${content.totalProjects || 0} modules in roadmap (${content.activeProjectsCount || 0} active, ${content.publishedCount || 0} published)\n\n`;
  result += `**Top Action Recommendation:** ${overdueStores.length > 0 ? `Schedule a floor walk at **${overdueStores[0].name}**.` : `Review pending milestones on your active training modules.`}`;
  return result;
}

// Server-side Gemini API endpoint
app.post('/api/gemini/generate', async (req, res) => {
  const { prompt, customApiKey, context } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const apiKey = customApiKey || process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const systemInstruction = `You are the Cadence Executive AI Assistant & Automotive Coaching Strategist.
You act as a senior automotive field operations director, coaching partner, and dealership performance advisor.

Your core purpose is to analyze EVERYTHING across the Cadence platform and:
1. Provide deep, actionable operational insights across stores, team members, visit logs, tasks, and training content.
2. Answer questions accurately and directly using the real live data in the user's platform.
3. Prioritize high-impact actions for the user: tell them exactly which dealership needs a visit first, which team member needs coaching, which urgent tasks are overdue, and which training content modules are ready to produce or launch.

Tone & Style Guidelines:
- Professional, direct, practical, and conversational—the voice of an experienced, hands-on automotive sales director or VP of training.
- No generic AI fluff or corporate buzzwords. Refer directly to the user's real store names, real employee names, actual visit logs, actual task titles, and real content project titles.
- Use clean Markdown with bold headings, bullet points, and prioritized action numbers (e.g., 1. 🚨 Urgent Store Visit, 2. ⚡ In-Flight Task, 3. 🎯 Coaching Opportunity).
- When asked to analyze or prioritize, synthesize connections across multiple areas (e.g., connect an employee's goal or a recent visit log observation to a training content module in development or an open task).

You have full real-time access to the user's Cadence platform data provided in the prompt context.`;

      let promptPayload = prompt;
      if (context) {
        promptPayload = `Current Platform Data Snapshot:\n${JSON.stringify(context, null, 2)}\n\nUser Question / Command:\n${prompt}`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptPayload,
        config: {
          systemInstruction,
          temperature: 0.3
        }
      });

      if (response && response.text) {
        return res.json({ text: response.text });
      }
    } catch (err) {
      console.warn('Gemini API call failed, falling back to dynamic internal platform analyzer:', err.message);
    }
  }

  // Run dynamic platform analyzer fallback
  const fallbackText = generateDynamicFallbackAnalysis(prompt, context);
  return res.json({ text: fallbackText });
});

// Serve static assets from project root
app.use(express.static(__dirname));

// Single-page fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Cadence hub running on http://${HOST}:${PORT}`);
});
