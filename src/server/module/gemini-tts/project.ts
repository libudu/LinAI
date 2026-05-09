import fs from 'fs-extra'
import { v4 as uuidv4 } from 'uuid'
import { PROJECTS_FILE } from './constants'

export interface GeminiTTSCharacter {
  id: string
  name: string
  gender: string
  voiceName: string
  description?: string
}

export interface GeminiTTSDialogue {
  id: string
  characterId: string
  content: string
  audioUrl?: string
  createdAt: number
}

export interface Project {
  id: string
  name: string
  description: string
  characters: GeminiTTSCharacter[]
  dialogues: GeminiTTSDialogue[]
  createdAt: number
  updatedAt: number
}

class ProjectManager {
  private static instance: ProjectManager

  private constructor() {}

  static getInstance(): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager()
    }
    return ProjectManager.instance
  }

  async getProjects(): Promise<Project[]> {
    if (await fs.pathExists(PROJECTS_FILE)) {
      const data = await fs.readFile(PROJECTS_FILE, 'utf-8')
      try {
        return JSON.parse(data)
      } catch (e) {
        return []
      }
    }
    return []
  }

  async saveProjects(projects: Project[]): Promise<void> {
    await fs.ensureFile(PROJECTS_FILE)
    await fs.writeFile(
      PROJECTS_FILE,
      JSON.stringify(projects, null, 2),
      'utf-8',
    )
  }

  async createProject(
    data: Pick<Project, 'name' | 'description'>,
  ): Promise<Project> {
    const projects = await this.getProjects()
    const newProject: Project = {
      id: uuidv4(),
      name: data.name,
      description: data.description,
      characters: [],
      dialogues: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    projects.push(newProject)
    await this.saveProjects(projects)
    return newProject
  }

  async getProjectById(id: string): Promise<Project | null> {
    const projects = await this.getProjects()
    return projects.find((p) => p.id === id) || null
  }

  async updateProject(
    id: string,
    data: Partial<Omit<Project, 'id' | 'createdAt'>>,
  ): Promise<Project | null> {
    const projects = await this.getProjects()
    const index = projects.findIndex((p) => p.id === id)
    if (index !== -1) {
      projects[index] = {
        ...projects[index],
        ...data,
        updatedAt: Date.now(),
      }
      await this.saveProjects(projects)
      return projects[index]
    }
    return null
  }

  async deleteProject(id: string): Promise<boolean> {
    const projects = await this.getProjects()
    const newProjects = projects.filter((p) => p.id !== id)
    if (newProjects.length !== projects.length) {
      await this.saveProjects(newProjects)
      return true
    }
    return false
  }
}

export const projectManager = ProjectManager.getInstance()
