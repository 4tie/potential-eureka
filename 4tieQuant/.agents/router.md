# Agent Router Configuration

## Routing Table

### Scout - Research Specialist
**Natural Language Triggers:**
- "research [topic]"
- "find information about [topic]"
- "look up [topic] news"
- "investigate [topic] trends"
- "find sources on [topic]"
- "what's happening with [topic]"
- "competitor analysis for [topic]"

**Examples:**
- "Research the latest trends in AI trading"
- "Find information about competitor pricing strategies"
- "Look up recent news about cryptocurrency regulations"
- "Investigate emerging market opportunities in fintech"
- "Find sources on sustainable investing trends"

### Scribe - Content Writer
**Natural Language Triggers:**
- "write [content type]"
- "create [content type]"
- "draft [content type]"
- "blog post about [topic]"
- "social media post for [topic]"
- "newsletter content on [topic]"
- "write copy for [topic]"

**Examples:**
- "Write a blog post about the benefits of automated trading"
- "Create social media captions for our new feature launch"
- "Draft a newsletter about market trends"
- "Blog post about risk management in trading"
- "Write copy for our landing page"

### Reach - Marketing Strategist
**Natural Language Triggers:**
- "marketing strategy for [topic]"
- "growth plan for [topic]"
- "campaign ideas for [topic]"
- "monetization strategy for [topic]"
- "social media calendar for [topic]"
- "ad copy for [topic]"
- "partnership opportunities for [topic]"

**Examples:**
- "Marketing strategy for our new trading platform"
- "Growth plan for user acquisition"
- "Campaign ideas for product launch"
- "Monetization strategy for premium features"
- "Social media calendar for Q4"

### Dev - Developer
**Natural Language Triggers:**
- "build [feature]"
- "implement [feature]"
- "code [feature]"
- "fix [bug/issue]"
- "optimize [component]"
- "integrate [API/service]"
- "technical solution for [problem]"
- "debug [issue]"

**Examples:**
- "Build a new dashboard component"
- "Implement user authentication"
- "Code a backtest optimization feature"
- "Fix the login page bug"
- "Optimize the database queries"
- "Integrate payment API"

## Slash-Command Shortcuts

**Syntax:**
- `/scout [research task]` - Direct dispatch to Scout
- `/scribe [writing task]` - Direct dispatch to Scribe
- `/reach [marketing task]` - Direct dispatch to Reach
- `/dev [development task]` - Direct dispatch to Dev
- `Run full pipeline on [topic]` - Execute supervisor flow pipeline

**Examples:**
- `/scout Research latest DeFi trends`
- `/scribe Write blog post about trading psychology`
- `/reach Create marketing strategy for Q4 launch`
- `/dev Build new portfolio dashboard component`
- `Run full pipeline on AI trading trends`
- `Run full pipeline on sustainable investing`

## Fallback Behavior

When the router is unsure which agent a task belongs to:

1. **Check for ambiguous keywords** - If task contains keywords from multiple domains (e.g., "research and write about"), ask for clarification
2. **Default to Orchestrator** - If still unclear after keyword analysis, route to Orchestrator for decision
3. **Ask user to clarify** - Present the ambiguity and ask user to specify the primary intent
4. **Offer agent suggestions** - Suggest which agents might be appropriate based on task analysis

**Fallback Response Template:**
```
This task could belong to multiple agents. Please clarify the primary intent:

- Scout: [research aspect if present]
- Scribe: [writing aspect if present]
- Reach: [marketing aspect if present]
- Dev: [technical aspect if present]

Which agent should handle this task?
```

## Owner
Mohs (highest authority)

## Orchestrator
System-wide coordinator for agent routing and task delegation
