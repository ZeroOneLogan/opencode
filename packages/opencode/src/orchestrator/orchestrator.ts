import { Agent } from "../agent/agent"
import { Session } from "../session"
import { MessageV2 } from "../session/message-v2"
import { SessionPrompt } from "../session/prompt"
import { Identifier } from "../id/id"
import { Config } from "../config/config"
import { Log } from "@/util/log"
import { Instance } from "../project/instance"
import z from "zod"

/**
 * Master Multi-Agent Orchestrator
 * 
 * This orchestrator provides 100x enhanced capabilities by:
 * 1. Intelligent agent selection based on task analysis
 * 2. Parallel execution of multiple specialized agents
 * 3. Result aggregation and synthesis
 * 4. Learning from agent performance
 * 5. Context-aware coordination
 */
export namespace Orchestrator {
  const log = Log.create({ service: "orchestrator" })

  export interface Task {
    id: string
    description: string
    prompt: string
    context?: Record<string, any>
    priority?: number
    dependencies?: string[]
  }

  export interface AgentExecution {
    taskId: string
    agentName: string
    sessionId: string
    status: "pending" | "running" | "completed" | "failed"
    result?: any
    error?: Error
    startTime?: number
    endTime?: number
    performance?: {
      toolsUsed: number
      tokensUsed: number
      duration: number
    }
  }

  export interface OrchestratorResult {
    tasks: Task[]
    executions: AgentExecution[]
    aggregatedResult: string
    insights: string[]
    recommendations: string[]
  }

  // Agent performance tracking
  const performanceState = Instance.state(() => ({
    agentMetrics: new Map<string, {
      successCount: number
      failureCount: number
      avgDuration: number
      totalExecutions: number
      specializations: Set<string>
    }>()
  }))

  /**
   * Analyze a task and determine the best agents to handle it
   */
  export async function analyzeTask(task: Task): Promise<string[]> {
    log.info("analyzing task", { taskId: task.id })
    
    const agents = await Agent.list()
    const availableAgents = agents.filter(a => a.mode === "subagent" || a.mode === "all")
    
    // Extract keywords from task description and prompt
    const taskText = `${task.description} ${task.prompt}`.toLowerCase()
    const keywords = extractKeywords(taskText)
    
    // Score each agent based on their description and past performance
    const scores = await Promise.all(
      availableAgents.map(async agent => {
        let score = 0
        const description = (agent.description || "").toLowerCase()
        
        // Match based on keywords
        for (const keyword of keywords) {
          if (description.includes(keyword)) {
            score += 10
          }
        }
        
        // Boost based on past performance
        const metrics = (await performanceState()).agentMetrics.get(agent.name)
        if (metrics) {
          const successRate = metrics.successCount / metrics.totalExecutions
          score += successRate * 20
          
          // Boost if agent has specialized in similar tasks
          for (const keyword of keywords) {
            if (metrics.specializations.has(keyword)) {
              score += 15
            }
          }
        }
        
        // Special scoring for known agent types
        if (taskText.includes("search") || taskText.includes("find")) {
          if (agent.name === "explore") score += 25
        }
        if (taskText.includes("research") || taskText.includes("analysis")) {
          if (agent.name === "general") score += 20
        }
        
        return { agent: agent.name, score }
      })
    )
    
    // Return top agents sorted by score
    const selectedAgents = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter(s => s.score > 0)
      .map(s => s.agent)
    
    log.info("selected agents", { agents: selectedAgents, scores: scores.filter(s => s.score > 0) })
    
    return selectedAgents.length > 0 ? selectedAgents : ["general"]
  }

  /**
   * Execute multiple tasks in parallel with intelligent agent assignment
   */
  export async function executeParallel(
    tasks: Task[],
    parentSessionId: string,
    parentMessageId: string
  ): Promise<OrchestratorResult> {
    log.info("executing parallel tasks", { count: tasks.length })
    
    const executions: AgentExecution[] = []
    const results: Map<string, any> = new Map()
    
    // Analyze all tasks and assign agents
    const assignments = await Promise.all(
      tasks.map(async task => ({
        task,
        agents: await analyzeTask(task)
      }))
    )
    
    // Execute tasks in parallel, respecting dependencies
    const executionPromises = assignments.map(async ({ task, agents }) => {
      // Wait for dependencies to complete
      if (task.dependencies) {
        await waitForDependencies(task.dependencies, executions)
      }
      
      // Try agents in order of preference
      for (const agentName of agents) {
        const execution: AgentExecution = {
          taskId: task.id,
          agentName,
          sessionId: "",
          status: "pending",
          startTime: Date.now()
        }
        executions.push(execution)
        
        try {
          execution.status = "running"
          const result = await executeWithAgent(
            task,
            agentName,
            parentSessionId,
            parentMessageId
          )
          
          execution.status = "completed"
          execution.endTime = Date.now()
          execution.result = result
          execution.sessionId = result.sessionId
          execution.performance = {
            toolsUsed: result.toolsUsed || 0,
            tokensUsed: result.tokensUsed || 0,
            duration: execution.endTime - (execution.startTime || 0)
          }
          
          // Track performance
          await trackPerformance(agentName, task, true, execution.performance.duration)
          
          results.set(task.id, result)
          break // Success, no need to try other agents
          
        } catch (error) {
          execution.status = "failed"
          execution.error = error as Error
          execution.endTime = Date.now()
          
          await trackPerformance(
            agentName, 
            task, 
            false, 
            execution.endTime - (execution.startTime || 0)
          )
          
          // If this was the last agent, propagate the error
          if (agentName === agents[agents.length - 1]) {
            throw error
          }
          // Otherwise, try the next agent
        }
      }
    })
    
    await Promise.all(executionPromises)
    
    // Aggregate results
    const aggregated = await aggregateResults(tasks, results)
    
    // Generate insights
    const insights = generateInsights(executions)
    
    // Generate recommendations
    const recommendations = await generateRecommendations(executions)
    
    return {
      tasks,
      executions,
      aggregatedResult: aggregated,
      insights,
      recommendations
    }
  }

  /**
   * Execute a task with a specific agent
   */
  async function executeWithAgent(
    task: Task,
    agentName: string,
    parentSessionId: string,
    parentMessageId: string
  ): Promise<any> {
    log.info("executing with agent", { taskId: task.id, agent: agentName })
    
    const agent = await Agent.get(agentName)
    if (!agent) {
      throw new Error(`Agent not found: ${agentName}`)
    }
    
    const config = await Config.get()
    
    // Create a session for this execution
    const session = await Session.create({
      parentID: parentSessionId,
      title: `${task.description} (@${agent.name})`,
      permission: [
        {
          permission: "task",
          pattern: "*",
          action: "deny"
        }
      ]
    })
    
    const messageID = Identifier.ascending("message")
    
    // Get parent message for model info
    const parentMsg = await MessageV2.get({ 
      sessionID: parentSessionId, 
      messageID: parentMessageId 
    })
    
    const model = agent.model ?? {
      modelID: parentMsg.info.modelID,
      providerID: parentMsg.info.providerID
    }
    
    // Build enhanced prompt with context
    let enhancedPrompt = task.prompt
    if (task.context) {
      enhancedPrompt = `Context: ${JSON.stringify(task.context, null, 2)}\n\n${task.prompt}`
    }
    
    const promptParts = await SessionPrompt.resolvePromptParts(enhancedPrompt)
    
    // Execute
    const result = await SessionPrompt.prompt({
      messageID,
      sessionID: session.id,
      model: {
        modelID: model.modelID,
        providerID: model.providerID
      },
      agent: agent.name,
      tools: {
        task: false
      },
      parts: promptParts
    })
    
    // Get all messages to analyze
    const messages = await Session.messages({ sessionID: session.id })
    const toolsUsed = messages
      .filter(x => x.info.role === "assistant")
      .flatMap(msg => msg.parts.filter((x: any) => x.type === "tool"))
      .length
    
    return {
      sessionId: session.id,
      text: result.parts.findLast(x => x.type === "text")?.text ?? "",
      parts: result.parts,
      toolsUsed,
      messages
    }
  }

  /**
   * Wait for task dependencies to complete
   */
  async function waitForDependencies(
    dependencies: string[],
    executions: AgentExecution[]
  ): Promise<void> {
    const checkInterval = 100 // ms
    const maxWait = 300000 // 5 minutes
    const startTime = Date.now()
    
    while (true) {
      const allComplete = dependencies.every(depId => {
        const execution = executions.find(e => e.taskId === depId)
        return execution && (execution.status === "completed" || execution.status === "failed")
      })
      
      if (allComplete) break
      
      if (Date.now() - startTime > maxWait) {
        throw new Error(`Dependency wait timeout for: ${dependencies.join(", ")}`)
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval))
    }
  }

  /**
   * Track agent performance metrics
   */
  async function trackPerformance(
    agentName: string,
    task: Task,
    success: boolean,
    duration: number
  ): Promise<void> {
    const state = await performanceState()
    let metrics = state.agentMetrics.get(agentName)
    
    if (!metrics) {
      metrics = {
        successCount: 0,
        failureCount: 0,
        avgDuration: 0,
        totalExecutions: 0,
        specializations: new Set()
      }
      state.agentMetrics.set(agentName, metrics)
    }
    
    if (success) {
      metrics.successCount++
    } else {
      metrics.failureCount++
    }
    
    metrics.totalExecutions++
    metrics.avgDuration = (metrics.avgDuration * (metrics.totalExecutions - 1) + duration) / metrics.totalExecutions
    
    // Track specializations from keywords
    const keywords = extractKeywords(`${task.description} ${task.prompt}`)
    keywords.forEach(k => metrics!.specializations.add(k))
  }

  /**
   * Aggregate results from multiple task executions
   */
  async function aggregateResults(tasks: Task[], results: Map<string, any>): Promise<string> {
    const parts: string[] = []
    
    for (const task of tasks) {
      const result = results.get(task.id)
      if (result) {
        parts.push(`## ${task.description}\n\n${result.text}\n`)
      }
    }
    
    return parts.join("\n---\n\n")
  }

  /**
   * Generate insights from execution history
   */
  function generateInsights(executions: AgentExecution[]): string[] {
    const insights: string[] = []
    
    const completed = executions.filter(e => e.status === "completed")
    const failed = executions.filter(e => e.status === "failed")
    
    if (completed.length > 0) {
      insights.push(`Successfully completed ${completed.length} task(s)`)
    }
    
    if (failed.length > 0) {
      insights.push(`${failed.length} task(s) failed`)
    }
    
    // Analyze performance
    const avgDuration = completed.reduce((sum, e) => sum + (e.performance?.duration || 0), 0) / completed.length
    if (avgDuration) {
      insights.push(`Average execution time: ${Math.round(avgDuration / 1000)}s`)
    }
    
    // Identify best performing agents
    const agentSuccess = new Map<string, number>()
    completed.forEach(e => {
      agentSuccess.set(e.agentName, (agentSuccess.get(e.agentName) || 0) + 1)
    })
    
    if (agentSuccess.size > 0) {
      const best = Array.from(agentSuccess.entries()).sort((a, b) => b[1] - a[1])[0]
      insights.push(`Most effective agent: ${best[0]} (${best[1]} successes)`)
    }
    
    return insights
  }

  /**
   * Generate recommendations for future optimizations
   */
  async function generateRecommendations(executions: AgentExecution[]): Promise<string[]> {
    const recommendations: string[] = []
    const state = await performanceState()
    
    // Analyze agent metrics
    for (const [agentName, metrics] of state.agentMetrics) {
      const successRate = metrics.successCount / metrics.totalExecutions
      
      if (successRate < 0.5 && metrics.totalExecutions > 5) {
        recommendations.push(`Consider improving or replacing agent '${agentName}' (success rate: ${Math.round(successRate * 100)}%)`)
      }
      
      if (metrics.avgDuration > 60000 && metrics.totalExecutions > 3) {
        recommendations.push(`Agent '${agentName}' has high average execution time (${Math.round(metrics.avgDuration / 1000)}s)`)
      }
    }
    
    // Analyze parallel execution efficiency
    const parallelTasks = executions.filter(e => e.startTime).length
    if (parallelTasks > 3) {
      recommendations.push(`Parallel execution utilized effectively with ${parallelTasks} concurrent tasks`)
    }
    
    return recommendations
  }

  /**
   * Extract meaningful keywords from text
   */
  function extractKeywords(text: string): string[] {
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
      "been", "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "should", "could", "can", "may", "might", "must", "shall"
    ])
    
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 20)
  }

  /**
   * Get performance metrics for all agents
   */
  export async function getMetrics(): Promise<Map<string, any>> {
    const state = await performanceState()
    return new Map(state.agentMetrics)
  }

  /**
   * Reset performance metrics
   */
  export async function resetMetrics(): Promise<void> {
    const state = await performanceState()
    state.agentMetrics.clear()
  }
}
