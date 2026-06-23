# Supervisor Flow - Content Pipeline

## Pipeline Sequence
1. **Scout** researches the topic
2. **Scout** passes findings to Scribe
3. **Scribe** writes the blog/content
4. **Scribe** passes content to Reach
5. **Reach** creates social media posts from the content
6. **Reach** builds marketing/promotion strategy from the same content
7. **Reach** delivers the final promotion plan

## Command Syntax
**Manual Trigger:**
```
Run full pipeline on [topic]
```

**Examples:**
- "Run full pipeline on AI trading trends"
- "Run full pipeline on sustainable investing"
- "Run full pipeline on DeFi opportunities"

## Automatic Trigger
Supervisor detects pipeline-worthy tasks and auto-runs when:
- Task requires research + content + marketing
- Topic is new or requires comprehensive coverage
- User requests "comprehensive content" or "full campaign"

## Handoff Protocols

### Scout → Scribe Handoff
**Scout provides:**
- Research findings with sources
- Key insights and data points
- Target audience analysis
- Trend analysis

**Scribe receives:**
- Structured research brief
- Source citations
- Data-backed insights

### Scribe → Reach Handoff
**Scribe provides:**
- Completed blog/content
- Key messages and CTAs
- Target keywords
- Content structure

**Reach receives:**
- Final content for repurposing
- Brand voice guidelines
- Content themes to amplify

## Pipeline States
1. **Initiated** - Command received, topic identified
2. **Researching** - Scout gathering information
3. **Writing** - Scribe creating content
4. **Marketing** - Reach developing strategy
5. **Complete** - Final promotion plan delivered

## Error Handling
- If Scout fails: Alert user, pause pipeline
- If Scribe fails: Return to Scout for more research
- If Reach fails: Return to Scribe for content revision

## Owner
Mohs (highest authority)

## Orchestrator
Pipeline coordinator and supervisor
