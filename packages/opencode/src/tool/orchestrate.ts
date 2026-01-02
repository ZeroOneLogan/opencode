import { Tool } from "./tool"
import DESCRIPTION from "./orchestrate.txt"
import z from "zod"
import { Orchestrator } from "../orchestrator/orchestrator"
import { Identifier } from "../id/id"

export const OrchestrateTool = Tool.define("orchestrate", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      tasks: z
        .array(
          z.object({
            description: z.string().describe("Short description of the task (3-5 words)"),
            prompt: z.string().describe("Detailed prompt for the agent to execute"),
            priority: z.number().optional().describe("Priority level (1-10, higher is more important)"),
            dependencies: z
              .array(z.string())
              .optional()
              .describe("IDs of tasks that must complete before this one"),
            context: z
              .record(z.any())
              .optional()
              .describe("Additional context data for the task"),
          })
        )
        .describe("Array of tasks to execute with the orchestrator"),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "orchestrate",
        patterns: ["*"],
        metadata: {
          taskCount: params.tasks.length,
          descriptions: params.tasks.map(t => t.description),
        },
      })

      // Generate IDs for tasks
      const tasks: Orchestrator.Task[] = params.tasks.map((task, index) => ({
        id: `task-${index}`,
        description: task.description,
        prompt: task.prompt,
        priority: task.priority,
        dependencies: task.dependencies,
        context: task.context,
      }))

      ctx.metadata({
        title: `Orchestrating ${tasks.length} tasks`,
        metadata: {
          taskCount: tasks.length,
          tasks: tasks.map(t => ({
            id: t.id,
            description: t.description,
            dependencies: t.dependencies,
          })),
        },
      })

      // Execute with orchestrator
      const result = await Orchestrator.executeParallel(
        tasks,
        ctx.sessionID,
        ctx.messageID
      )

      // Build output
      const output = [
        "# Orchestrated Execution Results\n",
        `## Summary`,
        `- Total tasks: ${result.tasks.length}`,
        `- Completed: ${result.executions.filter(e => e.status === "completed").length}`,
        `- Failed: ${result.executions.filter(e => e.status === "failed").length}`,
        "",
        "## Insights",
        ...result.insights.map(i => `- ${i}`),
        "",
      ]

      if (result.recommendations.length > 0) {
        output.push("## Recommendations")
        output.push(...result.recommendations.map(r => `- ${r}`))
        output.push("")
      }

      output.push("## Execution Details\n")
      for (const execution of result.executions) {
        if (execution.status === "completed") {
          output.push(`### ${execution.taskId} (${execution.agentName})`)
          output.push(`- Status: ✅ Completed`)
          output.push(`- Session: ${execution.sessionId}`)
          if (execution.performance) {
            output.push(`- Duration: ${Math.round(execution.performance.duration / 1000)}s`)
            output.push(`- Tools used: ${execution.performance.toolsUsed}`)
          }
          output.push("")
        } else if (execution.status === "failed") {
          output.push(`### ${execution.taskId} (${execution.agentName})`)
          output.push(`- Status: ❌ Failed`)
          output.push(`- Error: ${execution.error?.message}`)
          output.push("")
        }
      }

      output.push("\n## Aggregated Results\n")
      output.push(result.aggregatedResult)

      return {
        title: `Orchestrated ${tasks.length} tasks`,
        metadata: {
          taskCount: tasks.length,
          completed: result.executions.filter(e => e.status === "completed").length,
          failed: result.executions.filter(e => e.status === "failed").length,
          insights: result.insights,
          recommendations: result.recommendations,
          executions: result.executions.map(e => ({
            taskId: e.taskId,
            agent: e.agentName,
            status: e.status,
            sessionId: e.sessionId,
            duration: e.performance?.duration,
          })),
        },
        output: output.join("\n"),
      }
    },
  }
})
