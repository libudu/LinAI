import fs from 'fs-extra'
import { v4 as uuidv4 } from 'uuid'
import { PROJECTS_FILE } from './constants'

export interface TTSCharacter {
  id: string
  name: string
  voiceName: string
  voicePrompt?: string
}

export interface TTSDialogue {
  id: string
  characterId: string
  content: string
  audioUrl?: string
  createdAt: number
}

export interface TTSProject {
  id: string
  name: string
  backgroundPrompt: string
  characters: TTSCharacter[]
  dialogues: TTSDialogue[]
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

  async getProjects(): Promise<TTSProject[]> {
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

  async saveProjects(projects: TTSProject[]): Promise<void> {
    await fs.ensureFile(PROJECTS_FILE)
    await fs.writeFile(
      PROJECTS_FILE,
      JSON.stringify(projects, null, 2),
      'utf-8',
    )
  }

  async createProject(
    data: Pick<TTSProject, 'name' | 'backgroundPrompt'>,
  ): Promise<TTSProject> {
    const projects = await this.getProjects()
    const newProject: TTSProject = {
      id: uuidv4(),
      name: data.name,
      backgroundPrompt: data.backgroundPrompt,
      characters: [],
      dialogues: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    projects.push(newProject)
    await this.saveProjects(projects)
    return newProject
  }

  async getProjectById(id: string): Promise<TTSProject | null> {
    const projects = await this.getProjects()
    return projects.find((p) => p.id === id) || null
  }

  async updateProject(
    id: string,
    data: Partial<Omit<TTSProject, 'id' | 'createdAt'>>,
  ): Promise<TTSProject | null> {
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
