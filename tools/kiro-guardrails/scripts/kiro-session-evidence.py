"""Counts-only summary of Kiro's local session store for one workspace: sessions, tool calls,
hook runs, models, steering, sub-agents and the files Kiro wrote. Prints JSON. It never prints
prompts, replies or file contents. Usage: python3 kiro-session-evidence.py ~/.kiro/sessions/<hash> [repo]"""
import json, glob, collections, os, sys
ROOT = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 else sys.exit('usage: kiro-session-evidence.py ~/.kiro/sessions/<workspace-hash> [repo-root]')
REPO = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else '.') + '/'
out = []
tot = collections.Counter(); hooks = collections.Counter(); hook_status = collections.Counter()
tools_all = collections.Counter(); written_all = set(); kiro_written = set(); models = collections.Counter()
steer = collections.Counter(); subagents = collections.Counter(); interactions = collections.Counter()
sessions = []
for d in sorted(glob.glob(ROOT + '/sess_*')):
    s = json.load(open(d + '/session.json'))
    c = collections.Counter(); tools = collections.Counter(); written = set(); first = last = None
    for line in open(d + '/messages.jsonl'):
        try: m = json.loads(line)
        except Exception: continue
        ts = m.get('timestamp'); p = m.get('payload', {}); t = p.get('type')
        if ts:
            first = min(first, ts) if first else ts; last = max(last, ts) if last else ts
        c[t] += 1
        if t == 'tool_call':
            tools[p.get('toolName')] += 1
            fp = p.get('filePath') or ''
            if fp and p.get('toolName') in ('fsWrite','fs_write','strReplace','str_replace','fs_append','fsAppend','createHook','delete_file','deleteFile') :
                rel = fp.replace(REPO, '')
                written.add(rel)
        if t == 'ContextualHookInvoked':
            hooks[p.get('name')] += 1; hook_status[(p.get('name'), p.get('status'))] += 1
        if t == 'assistant' and p.get('reasoningModelId'): models[p.get('reasoningModelId')] += 1
        if t == 'steering_inclusion':
            for doc in p.get('documents') or []:
                n = doc.get('name') if isinstance(doc, dict) else str(doc)
                steer[os.path.basename(str(n))] += 1
        if t == 'sub_agent_start': subagents[p.get('subAgentName')] += 1
        if t == 'interaction_resolved': interactions[str(p.get('outcome'))] += 1
    tot.update(c); tools_all.update(tools); written_all |= written
    sessions.append(dict(id=s['id'][5:13], created=s['createdAt'][:16].replace('T',' '), first=(first or '')[:16].replace('T',' '), last=(last or '')[:16].replace('T',' '), mode=s.get('agentMode'), model=s.get('modelId'), autopilot=s.get('autopilot'), turns=c['user'], tools=sum(tools.values()), files=len(written), hooks=c['ContextualHookInvoked']))
print(json.dumps(dict(sessions=sessions, totals={k:v for k,v in tot.items()}, tools=tools_all.most_common(), hooks=hooks.most_common(), hook_status=[[list(k),v] for k,v in hook_status.most_common()], models=models.most_common(), steering=steer.most_common(), subagents=subagents.most_common(), interactions=interactions.most_common(), written_dirs=collections.Counter(('/'.join(w.split('/')[:3]) if w.startswith('.kiro') else '/'.join(w.split('/')[:2])) for w in written_all).most_common(), kiro_files=sorted(w for w in written_all if w.startswith('.kiro') or w.startswith('docs/kiro') or w=='AGENTS.md')), indent=1))
