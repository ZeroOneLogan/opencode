import { Tool } from "./tool"
import DESCRIPTION from "./analyze.txt"
import z from "zod"
import { Intelligence } from "../intelligence/intelligence"

export const AnalyzeTool = Tool.define("analyze", async () => {
  return {
    description: DESCRIPTION,
    parameters: z.object({
      problem: z.string().describe("The problem or question to analyze"),
      context: z
        .record(z.any())
        .optional()
        .describe("Additional context information"),
      include_perspectives: z
        .boolean()
        .default(true)
        .describe("Include multi-perspective analysis"),
      include_decomposition: z
        .boolean()
        .default(true)
        .describe("Include task decomposition recommendations"),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "analyze",
        patterns: ["*"],
        metadata: {
          problem: params.problem,
          include_perspectives: params.include_perspectives,
          include_decomposition: params.include_decomposition,
        },
      })

      ctx.metadata({
        title: "Analyzing problem",
        metadata: {
          problem: params.problem,
        },
      })

      // Generate comprehensive analysis report
      const report = await Intelligence.generateAnalysisReport({
        problem: params.problem,
        context: params.context,
        requiresPerspectives: params.include_perspectives,
        requiresDecomposition: params.include_decomposition,
      })

      return {
        title: "Analysis complete",
        metadata: {
          problem: params.problem,
        },
        output: report,
      }
    },
  }
})
