#!/usr/bin/env python3
"""Generate a fully-enumerated layered architecture .drawio for Dwellium.
Layout: each LAYER is a horizontal band (swimlane); inside it, SUB-GROUPS are
swimlanes shelf-packed left-to-right; inside each sub-group, ITEM chips sit in a grid."""
import math, html

# ---------- palette per layer (fill, stroke) ----------
P = {
    'blue':   ('#dae8fc', '#6c8ebf'),
    'purple': ('#e1d5e7', '#9673a6'),
    'orange': ('#ffe6cc', '#d79b00'),
    'green':  ('#d5e8d4', '#82b366'),
    'grey':   ('#f5f5f5', '#666666'),
    'yellow': ('#fff2cc', '#d6b656'),
}

# ---------- the full inventory ----------
LAYERS = [
 ('b1', '1 · UI Shell  —  React + React Router v7 (library mode)', 'blue', [
   ('Entry / Shell', ['main.tsx','App.tsx (Router)','AuthGate','AdminShell','TenantPortal','PopupShell','SecurityPortal','HalocronOS (Desktop)','Sidebar','Dock','CommandPalette ⌘K','BackendConnectionBanner','AppSuspenseFallback','ErrorBoundary']),
   ('Context Providers', ['ThemeContext','UserContext','PermissionsContext','HierarchyContext','LayoutContext','WindowContext']),
   ('Auth', ['LoginScreen','TenantLoginScreen','GoogleSignInButton','SessionExpiredModal','FieldGuard']),
   ('Widget Registry · 54 widgets', ['strata-dashboard','astra-dashboard','wiki','synthesis','foundry','knowledge-graph','memory-graph-rag','hive','ara-console','agent-lab','builder-agents','hermes','honcho','hydra-ai','two-brains','stella-agent','open-jarvis','thought-weaver','fact-check-log','cognitive-harness','autonomous-runs','automation-hub','mission-control','system-health','ai-spend','cost-kpi','content-search','global-search','file-explorer','file-manager','doc-viewer','pdf-gear','scribe','notepad','holocron-library','artifact-gallery','template-generator','inbox','inbox-zero','transcription','meeting','terminal','task-board','tasks','time-travel','tags','tag-file','connections','api-keys','control-panel','ui-editor','workspace','georgia-code','home-upkeep-ai','trello-board','notebooklm-context','universal-shell','tenant-portal-mgmt']),
 ]),
 ('b2', '2 · Client State & Services  —  Zustand · localStorage · One Save sync · typed buses', 'purple', [
   ('Per-User / App Stores', ['integrationsStore','activationStore','agentContextStore','aiHealthStore','araPrefsStore','artifactStore','backendStatusStore','costKpiStore','goalsStore','halocronOsStore','hiddenWidgetsStore','llmUsageStore','morningBriefStore','oneSaveStore','spacesStore','subscriptionsStore','tabGroupStore','tagStore','tagsStore','uiEditStore','widgetEnhancementsStore','workspacesStore']),
   ('LLM / Routing', ['llmClient','llmRouter','llmStream','oneSaveClient','secretsAdapter','costAdvisor','contextWindow','unifiedMemory']),
   ('Agent / Hermes', ['agentTeamsStore','personas','personaWorkStore','skills','spawn','orchestrator','hermesStatus','conductorChain','dwelliumCommands','widgetActions']),
   ('Lib (misc)', ['busChannels','typedBus','backendStatus','dailySynthesis','goalPlanner','googleAccounts','openDocContext','serviceLaunch','terminalLaunch','transcriptSearch','ttsVoices','uiEditParser','windowStacks','systemHealth']),
   ('Browser Services', ['googleIdentity','googleDriveStorage','sentry','errorReporter','emailRouter','cardSuggest','blastGate','hermesAutonomousRunner','honchoBackgroundRunner']),
   ('Hooks', ['useA11y','useAIAvailability','useActivation','useGridLock','useIntegrations','useSystemHealth']),
   ('Utils', ['createLocalStorageStore','integrationsCrypto','lazyWithReload','safeMarkdown','spotlight','gridLockStore']),
 ]),
 ('b3', '3 · API / Data-Access Client', 'orange', [
   ('API Client', ['strataApi (router)','strataApi.backend','strataApi.static']),
   ('Config', ['config/api.ts','API_BASE','INBOX_API','SECURITY_API','/api/v1','X-Qualia-API v2']),
   ('Server State', ['QueryProvider (React Query)']),
 ]),
 ('b4', '4 · Backend — Express  (sibling working copy: ai-dashboard369-file-manager · :3000)', 'green', [
   ('Entry / Middleware', ['app.ts','authMiddleware','auditMiddleware','errorTrackingMiddleware','propertyScopeMiddleware','permissionsService','rateLimiter','promptSecurity','HookManager (guardian+triage)']),
   ('Routes · 51', ['accounting','ara','asset','audit','auth','automation','browserIntern','calendar','corporateReview','diagnostics','docsConvert','dwellium','error','feature','fileExplorer','file','forecast','georgiaCode','gmailSend','googleOAuth','hydra','inbox','integration','intelligence','knowledgeGraph','leaseCoach','llmRouter','maintenanceAgent','object','scheduler','scribeDnd','scribe','search','security','sentiment','settings','status','stella','systemUpdate','task','tenantAdmin','tenant','terminal','thoughtWeaver','transcription','trello','trelloVector','twoBrains','unitPhoto','vendorIntelligence','webhook']),
   ('Services · 62 (excl. 7 middleware)', ['accountingSchema','agentScheduler','aiTaskService','assetSchema','authService','automationEngine','automationScheduler','automationSchedulerCore','boardProjectMapper','browserInternService','calendarService','cashFlowForecastService','database','dayflowService','domainEncryption','dwelliumSchema','dwelliumSeed','entityGuardian','factCheckService','floorPlanService','georgiaCodeIndexer','gmailService','googleAuth','googleDriveService','hydraService','integrityChecks','intelligenceSchema','knowledgeGraphService','lanceVectorStore','leaseCoachService','leaseGenerator','legalShieldService','lessonsLearnedService','llmSafetyEventStore','maintenanceAgentService','meetingManagerService','messagingService','migrationRunner','notebooklmService','proprietaryFeaturesSchema','quickbooksService','ruVectorIndexer','ruVectorService','speakerLibrary','stellaService','storage','summaryService','syncEngine','tenantSentimentService','terminalService','timeClockService','transcriptWriterService','transcriptionService','trelloService','trelloSyncService','trelloVectorService','triageEngine','twilioService','vectorStore','vendorIntelligenceService','voiceService','zpgDomainSeed']),
   ('Stores / Schemas · 12', ['accountingStore','assetStore','auditLogStore','dwelliumStore','errorTrackingStore','inboxStore','notebooklmStore','objectStore','settingsStore','taskStore','thoughtWeaverStore','twoBrainsStore']),
   ('Backend Agents · 16', ['ara','araChatEngine','araPersonality','anomalyDetector','civilEngineerAgent','complianceAuditor','designAgent','designAgents','domainAgents','institutionalMemory','intakeClassifier','jamesAgent','nif','predictiveFlags','roiEngine','routingRules']),
   ('Controllers / MCP', ['FileController','notebooklmServer (MCP)']),
 ]),
 ('b5', '5 · External Services & Integrations', 'grey', [
   ('LLM Providers', ['Anthropic Claude','OpenAI','Google Gemini','OpenRouter','LM Studio','Moonshine (local)']),
   ('Google Cloud', ['Identity (OAuth)','Drive','Gmail','Calendar','Speech-to-Text','Text-to-Speech']),
   ('DB / Storage', ['Supabase','Postgres','One Save backend','LanceDB (vectors)','RuVector']),
   ('3rd-Party APIs', ['Trello','Twilio (SMS)','QuickBooks','Recall.ai','NotebookLM','Sentry']),
 ]),
 ('b6', '6 · Build / Deploy / CI  (orthogonal — ships the stack above)', 'yellow', [
   ('Frontend Build', ['react-router build','Vite plugins (kg·kb·eye)','Netlify deploy']),
   ('Backend Build', ['tsc → dist','ts-node-dev (hot)','node dist/app.js','launchd launcher','better-sqlite3 ABI']),
   ('CI · GitHub Actions Parity Gate', ['tsc -b','vitest','SSR smoke-test','Playwright axe','Playwright screenshot','PII scan']),
 ]),
]

# ---------- geometry constants ----------
CHIP_W, CHIP_H = 150, 26
CGX, CGY = 8, 6          # chip gaps
GP = 10                  # group inner padding
GTITLE = 26              # group title bar
BTITLE = 30              # band title bar
BAND_INNER_W = 2040      # usable width inside a band for shelf packing
BAND_X = 40
GROUP_GAP_X, GROUP_GAP_Y = 16, 18
BAND_GAP = 70
PAD = 14

def cols_for(n):
    if n <= 4: return max(1, n)
    if n <= 8: return 4
    if n <= 18: return 5
    return 6

def group_size(items):
    n = len(items); c = cols_for(n); r = math.ceil(n / c)
    w = GP*2 + c*CHIP_W + (c-1)*CGX
    h = GTITLE + GP*2 + r*CHIP_H + (r-1)*CGY
    return w, h, c, r

def esc(s):
    return html.escape(s, quote=True).replace('&#x27;', "&#39;")

cells = []
cid = [1]
def nid():
    cid[0] += 1
    return f"n{cid[0]}"

# title
cells.append(('text','title','Dwellium — Full Service-Layer Map (every module enumerated)',
              'text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=24;fontStyle=1;fontColor=#333333;',
              BAND_X, 0, BAND_INNER_W, 40, '1'))

band_y = 50
band_ids = []
for bid, btitle, color, groups in LAYERS:
    fill, stroke = P[color]
    # shelf-pack groups
    placed = []   # (gx, gy, gw, gh, name, items, cols)
    x = PAD; y = BTITLE + PAD; shelf_h = 0; shelf_has = False
    for name, items in groups:
        gw, gh, c, r = group_size(items)
        if shelf_has and x + gw > PAD + BAND_INNER_W:
            y += shelf_h + GROUP_GAP_Y; x = PAD; shelf_h = 0; shelf_has = False
        placed.append((x, y, gw, gh, name, items, c))
        x += gw + GROUP_GAP_X; shelf_h = max(shelf_h, gh); shelf_has = True
    band_h = y + shelf_h + PAD
    band_w = PAD*2 + BAND_INNER_W
    # band swimlane
    cells.append(('band', bid, btitle,
        f'swimlane;startSize={BTITLE};html=1;whiteSpace=wrap;rounded=0;fillColor={fill};strokeColor={stroke};fontSize=15;fontStyle=1;verticalAlign=top;align=left;spacingLeft=12;',
        BAND_X, band_y, band_w, band_h, '1'))
    band_ids.append((bid, band_y, band_h, band_w))
    # groups + chips
    for (gx, gy, gw, gh, name, items, c) in placed:
        gid = nid()
        cells.append(('group', gid, name,
            f'swimlane;startSize={GTITLE};html=1;whiteSpace=wrap;rounded=0;fillColor=#ffffff;strokeColor={stroke};fontSize=12;fontStyle=1;verticalAlign=top;align=left;spacingLeft=8;',
            gx, gy, gw, gh, bid))
        for i, it in enumerate(items):
            col = i % c; row = i // c
            chx = GP + col*(CHIP_W+CGX); chy = GTITLE + GP + row*(CHIP_H+CGY)
            cells.append(('chip', nid(), it,
                f'rounded=1;whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};fontSize=9;spacing=2;',
                chx, chy, CHIP_W, CHIP_H, gid))
    band_y += band_h + BAND_GAP

# ---------- edges ----------
def band_meta(bid):
    for x in band_ids:
        if x[0]==bid: return x
edges = []
flow = [('b1','b2','render · dispatch','#6c8ebf'),
        ('b2','b3','fetch (React Query)','#9673a6'),
        ('b3','b4','/api/*  ·  X-Qualia-API v2  ·  Bearer','#d79b00'),
        ('b4','b5','SQL · OAuth · SDK calls','#82b366')]
for s,t,lbl,col in flow:
    edges.append((nid(), lbl,
        f'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor={col};fontSize=12;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;',
        s,t,None))
# browser-direct LLM : b2 -> b5 along right
_,b2y,b2h,bw = band_meta('b2'); _,b5y,b5h,_ = band_meta('b5')
rx = BAND_X + bw + 60
edges.append((nid(),'browser-direct LLM&#xa;(encrypted keys)',
    f'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;strokeColor=#9673a6;fontSize=12;exitX=1;exitY=0.5;entryX=1;entryY=0.5;',
    'b2','b5',[(rx, b2y+b2h//2),(rx, b5y+b5h//2)]))
# build/deploy : b6 -> b1 along left
_,b1y,b1h,_ = band_meta('b1'); _,b6y,b6h,_ = band_meta('b6')
lx = 12
edges.append((nid(),'build · deploy',
    'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;strokeColor=#d6b656;fontSize=12;exitX=0;exitY=0.5;entryX=0;entryY=0.5;',
    'b6','b1',[(lx, b6y+b6h//2),(lx, b1y+b1h//2)]))

# ---------- emit ----------
total_h = band_y + 40
out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<mxfile host="drawio" version="30.0.4">',
       '  <diagram name="Dwellium-Full-Layers">',
       f'    <mxGraphModel dx="1400" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{BAND_X*2+bw}" pageHeight="{total_h}" math="0" shadow="0">',
       '      <root>',
       '        <mxCell id="0" />',
       '        <mxCell id="1" parent="0" />']
for kind, ident, val, style, x, y, w, h, parent in cells:
    out.append(f'        <mxCell id="{ident}" value="{esc(val)}" style="{style}" vertex="1" parent="{parent}">')
    out.append(f'          <mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry" />')
    out.append('        </mxCell>')
for eid, lbl, style, s, t, pts in edges:
    out.append(f'        <mxCell id="{eid}" value="{lbl}" style="{style}" edge="1" parent="1" source="{s}" target="{t}">')
    if pts:
        out.append('          <mxGeometry relative="1" as="geometry">')
        out.append('            <Array as="points">')
        for px,py in pts:
            out.append(f'              <mxPoint x="{px}" y="{py}" />')
        out.append('            </Array>')
        out.append('          </mxGeometry>')
    else:
        out.append('          <mxGeometry relative="1" as="geometry" />')
    out.append('        </mxCell>')
out += ['      </root>','    </mxGraphModel>','  </diagram>','</mxfile>']
open('dwellium-architecture-full.drawio','w').write('\n'.join(out))
print('wrote dwellium-architecture-full.drawio')
print('page size:', BAND_X*2+bw, 'x', total_h)
print('total cells:', len(cells), 'edges:', len(edges))
print('chips:', sum(1 for c in cells if c[0]=='chip'))
