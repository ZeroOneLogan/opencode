import { test, expect } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Orchestrator } from "../../src/orchestrator/orchestrator"

test("analyzeTask returns appropriate agents based on keywords", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-1",
        description: "Search and explore codebase",
        prompt: "Find all TypeScript files and analyze their structure"
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      expect(agents.length).toBeGreaterThan(0)
      expect(agents).toContain("explore")
    }
  })
})

test("analyzeTask selects general agent for research tasks", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-2",
        description: "Research and analysis",
        prompt: "Research best practices for error handling and analyze current implementation"
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      expect(agents.length).toBeGreaterThan(0)
      // Should prefer general agent for research tasks
      expect(agents[0]).toBe("general")
    }
  })
})

test("analyzeTask returns fallback agent when no match", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-3",
        description: "Generic task",
        prompt: "Do something"
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      expect(agents.length).toBeGreaterThan(0)
      expect(agents).toContain("general")
    }
  })
})

test("getMetrics returns performance data", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const metrics = await Orchestrator.getMetrics()
      expect(metrics).toBeDefined()
      expect(metrics instanceof Map).toBe(true)
    }
  })
})

test("resetMetrics clears performance data", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await Orchestrator.resetMetrics()
      const metrics = await Orchestrator.getMetrics()
      expect(metrics.size).toBe(0)
    }
  })
})

test("analyzeTask scores agents based on description match", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const searchTask: Orchestrator.Task = {
        id: "test-4",
        description: "Search files",
        prompt: "Find all JavaScript files in the src directory"
      }
      
      const agents = await Orchestrator.analyzeTask(searchTask)
      expect(agents).toBeDefined()
      // explore agent should be selected for search tasks
      expect(agents).toContain("explore")
    }
  })
})

test("analyzeTask handles tasks with context", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-5",
        description: "Analyze with context",
        prompt: "Analyze the following code",
        context: {
          file: "test.ts",
          language: "typescript"
        }
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      expect(agents.length).toBeGreaterThan(0)
    }
  })
})

test("analyzeTask handles priority field", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-6",
        description: "High priority task",
        prompt: "Critical analysis needed",
        priority: 10
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      expect(agents.length).toBeGreaterThan(0)
    }
  })
})

test("analyzeTask handles dependencies field", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-7",
        description: "Dependent task",
        prompt: "Task that depends on others",
        dependencies: ["task-1", "task-2"]
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      expect(agents.length).toBeGreaterThan(0)
    }
  })
})

test("analyzeTask returns multiple agent options", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const task: Orchestrator.Task = {
        id: "test-8",
        description: "Multi-faceted task",
        prompt: "Search, find, research and analyze complex patterns in the codebase"
      }
      
      const agents = await Orchestrator.analyzeTask(task)
      expect(agents).toBeDefined()
      // Should return multiple suitable agents
      expect(agents.length).toBeGreaterThanOrEqual(1)
      expect(agents.length).toBeLessThanOrEqual(3)
    }
  })
})
