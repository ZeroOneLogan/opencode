import { Agent } from "../agent/agent"
import { Log } from "@/util/log"
import { Orchestrator } from "../orchestrator/orchestrator"
import { generateObject } from "ai"
import { Provider } from "@/provider/provider"
import z from "zod"
import { SystemPrompt } from "../session/system"

/**
 * Enhanced Intelligence System
 * 
 * Provides advanced reasoning capabilities including:
 * 1. Multi-perspective analysis
 * 2. Automatic task decomposition
 * 3. Self-reflection and improvement
 * 4. Chain-of-thought reasoning optimization
 */
export namespace Intelligence {
  const log = Log.create({ service: "intelligence" })

  export interface AnalysisRequest {
    problem: string
    context?: Record<string, any>
    requiresPerspectives?: boolean
    requiresDecomposition?: boolean
  }

  export interface Perspective {
    viewpoint: string
    analysis: string
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
  }

  export interface DecomposedTask {
    subtasks: Orchestrator.Task[]
    strategy: string
    rationale: string
    estimatedComplexity: number
  }

  export interface ReflectionResult {
    strengths: string[]
    weaknesses: string[]
    improvements: string[]
    alternativeApproaches: string[]
    confidence: number
  }

  /**
   * Analyze a problem from multiple perspectives
   */
  export async function multiPerspectiveAnalysis(request: AnalysisRequest): Promise<Perspective[]> {
    log.info("performing multi-perspective analysis")

    const perspectives = [
      "technical-implementation",
      "user-experience",
      "security",
      "performance",
      "maintainability",
    ]

    const model = await Provider.defaultModel()
    const language = await Provider.getLanguage(await Provider.getModel(model.providerID, model.modelID))

    const results: Perspective[] = []

    for (const viewpoint of perspectives) {
      const system = SystemPrompt.header(model.providerID)
      system.push(
        `You are an expert analyst specializing in ${viewpoint} perspective. 
Analyze the following problem from your specialized viewpoint and provide:
1. Key insights from your perspective
2. Strengths of the current approach
3. Potential weaknesses or risks
4. Specific recommendations

Be concise but thorough in your analysis.`
      )

      const result = await generateObject({
        model: language,
        messages: [
          ...system.map((s) => ({ role: "system" as const, content: s })),
          {
            role: "user",
            content: `Problem: ${request.problem}\n\nContext: ${JSON.stringify(request.context || {}, null, 2)}`,
          },
        ],
        schema: z.object({
          analysis: z.string().describe("Detailed analysis from this perspective"),
          strengths: z.array(z.string()).describe("Strengths identified"),
          weaknesses: z.array(z.string()).describe("Weaknesses or concerns"),
          recommendations: z.array(z.string()).describe("Specific recommendations"),
        }),
      })

      results.push({
        viewpoint,
        analysis: result.object.analysis,
        strengths: result.object.strengths,
        weaknesses: result.object.weaknesses,
        recommendations: result.object.recommendations,
      })
    }

    return results
  }

  /**
   * Automatically decompose a complex task into subtasks
   */
  export async function decomposeTask(request: AnalysisRequest): Promise<DecomposedTask> {
    log.info("decomposing task")

    const model = await Provider.defaultModel()
    const language = await Provider.getLanguage(await Provider.getModel(model.providerID, model.modelID))

    const agents = await Agent.list()
    const availableAgents = agents
      .filter((a) => a.mode === "subagent" || a.mode === "all")
      .map((a) => `${a.name}: ${a.description || "General purpose agent"}`)
      .join("\n")

    const system = SystemPrompt.header(model.providerID)
    system.push(
      `You are an expert task planner. Break down complex problems into optimal subtasks.

Available agents:
${availableAgents}

For each subtask, determine:
1. A clear, concise description (3-5 words)
2. A detailed prompt for the agent
3. Which subtasks it depends on (if any)
4. Priority level (1-10, higher = more important)

Strategy: Identify subtasks that can run in parallel vs sequential dependencies.
Aim for 2-5 focused subtasks that maximize parallelization.`
    )

    const result = await generateObject({
      model: language,
      messages: [
        ...system.map((s) => ({ role: "system" as const, content: s })),
        {
          role: "user",
          content: `Task: ${request.problem}\n\nContext: ${JSON.stringify(request.context || {}, null, 2)}`,
        },
      ],
      schema: z.object({
        strategy: z.string().describe("Overall strategy for breaking down the task"),
        rationale: z.string().describe("Explanation of why this breakdown is optimal"),
        estimatedComplexity: z.number().min(1).max(10).describe("Overall complexity estimate (1-10)"),
        subtasks: z.array(
          z.object({
            description: z.string().describe("Short description (3-5 words)"),
            prompt: z.string().describe("Detailed prompt for the agent"),
            priority: z.number().min(1).max(10).describe("Priority level"),
            dependencies: z.array(z.number()).describe("Indices of subtasks this depends on"),
          })
        ),
      }),
    })

    // Convert to Orchestrator.Task format
    const tasks: Orchestrator.Task[] = result.object.subtasks.map((subtask, index) => ({
      id: `task-${index}`,
      description: subtask.description,
      prompt: subtask.prompt,
      priority: subtask.priority,
      dependencies: subtask.dependencies.map((depIndex) => `task-${depIndex}`),
      context: request.context,
    }))

    return {
      subtasks: tasks,
      strategy: result.object.strategy,
      rationale: result.object.rationale,
      estimatedComplexity: result.object.estimatedComplexity,
    }
  }

  /**
   * Reflect on a completed task and suggest improvements
   */
  export async function reflect(input: {
    task: string
    result: string
    metrics?: {
      duration: number
      toolsUsed: number
      agentsUsed: string[]
    }
  }): Promise<ReflectionResult> {
    log.info("performing reflection")

    const model = await Provider.defaultModel()
    const language = await Provider.getLanguage(await Provider.getModel(model.providerID, model.modelID))

    const system = SystemPrompt.header(model.providerID)
    system.push(
      `You are a critical thinking expert. Reflect on completed tasks to identify:
1. What went well (strengths)
2. What could be improved (weaknesses)
3. Specific improvements for next time
4. Alternative approaches that might work better
5. Confidence level in the result (0-100%)

Be honest, constructive, and actionable in your reflection.`
    )

    const result = await generateObject({
      model: language,
      messages: [
        ...system.map((s) => ({ role: "system" as const, content: s })),
        {
          role: "user",
          content: `Task: ${input.task}

Result: ${input.result}

Metrics: ${JSON.stringify(input.metrics || {}, null, 2)}

Provide your reflection:`,
        },
      ],
      schema: z.object({
        strengths: z.array(z.string()).describe("What worked well"),
        weaknesses: z.array(z.string()).describe("What could be improved"),
        improvements: z.array(z.string()).describe("Specific actionable improvements"),
        alternativeApproaches: z.array(z.string()).describe("Other approaches to consider"),
        confidence: z.number().min(0).max(100).describe("Confidence in the result (0-100%)"),
      }),
    })

    return result.object
  }

  /**
   * Optimize a chain of reasoning steps
   */
  export async function optimizeReasoning(steps: string[]): Promise<{
    optimizedSteps: string[]
    removedSteps: string[]
    reasoning: string
  }> {
    log.info("optimizing reasoning chain")

    const model = await Provider.defaultModel()
    const language = await Provider.getLanguage(await Provider.getModel(model.providerID, model.modelID))

    const system = SystemPrompt.header(model.providerID)
    system.push(
      `You are a reasoning optimization expert. Analyze chains of reasoning steps to:
1. Identify redundant or unnecessary steps
2. Combine related steps that can be merged
3. Reorder steps for better logical flow
4. Maintain correctness while improving efficiency

Return an optimized version with explanation.`
    )

    const result = await generateObject({
      model: language,
      messages: [
        ...system.map((s) => ({ role: "system" as const, content: s })),
        {
          role: "user",
          content: `Original reasoning steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Optimize this reasoning chain:`,
        },
      ],
      schema: z.object({
        optimizedSteps: z.array(z.string()).describe("Optimized reasoning steps"),
        removedSteps: z.array(z.string()).describe("Steps that were removed or merged"),
        reasoning: z.string().describe("Explanation of optimization decisions"),
      }),
    })

    return result.object
  }

  /**
   * Generate a comprehensive analysis report
   */
  export async function generateAnalysisReport(request: AnalysisRequest): Promise<string> {
    log.info("generating comprehensive analysis report")

    const [perspectives, decomposition] = await Promise.all([
      multiPerspectiveAnalysis(request),
      decomposeTask(request),
    ])

    const report: string[] = [
      "# Comprehensive Analysis Report",
      "",
      "## Problem Statement",
      request.problem,
      "",
      "## Multi-Perspective Analysis",
      "",
    ]

    for (const perspective of perspectives) {
      report.push(`### ${perspective.viewpoint.toUpperCase()}`)
      report.push("")
      report.push(perspective.analysis)
      report.push("")
      if (perspective.strengths.length > 0) {
        report.push("**Strengths:**")
        perspective.strengths.forEach((s) => report.push(`- ${s}`))
        report.push("")
      }
      if (perspective.weaknesses.length > 0) {
        report.push("**Concerns:**")
        perspective.weaknesses.forEach((w) => report.push(`- ${w}`))
        report.push("")
      }
      if (perspective.recommendations.length > 0) {
        report.push("**Recommendations:**")
        perspective.recommendations.forEach((r) => report.push(`- ${r}`))
        report.push("")
      }
    }

    report.push("## Recommended Task Decomposition")
    report.push("")
    report.push(`**Strategy:** ${decomposition.strategy}`)
    report.push("")
    report.push(`**Rationale:** ${decomposition.rationale}`)
    report.push("")
    report.push(`**Estimated Complexity:** ${decomposition.estimatedComplexity}/10`)
    report.push("")
    report.push("**Subtasks:**")
    decomposition.subtasks.forEach((task, i) => {
      report.push(`${i + 1}. **${task.description}** (Priority: ${task.priority || "N/A"})`)
      report.push(`   - ${task.prompt}`)
      if (task.dependencies && task.dependencies.length > 0) {
        report.push(`   - Dependencies: ${task.dependencies.join(", ")}`)
      }
      report.push("")
    })

    return report.join("\n")
  }
}
