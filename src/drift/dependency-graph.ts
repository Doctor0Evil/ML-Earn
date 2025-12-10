export type FileId = string;
export type ModuleId = string;

export interface FileModuleMap {
  fileToModules: Map<FileId, Set<ModuleId>>;
  moduleToFiles: Map<ModuleId, Set<FileId>>;
}

export class DependencyGraph {
  // module-level graph
  private moduleOutNeighbors: Map<ModuleId, Set<ModuleId>> = new Map();
  private moduleInNeighbors: Map<ModuleId, Set<ModuleId>> = new Map();
  // file->module map
  private fileToModules: Map<FileId, Set<ModuleId>> = new Map();

  constructor() {}

  addModule(moduleId: ModuleId) {
    if (!this.moduleOutNeighbors.has(moduleId)) this.moduleOutNeighbors.set(moduleId, new Set());
    if (!this.moduleInNeighbors.has(moduleId)) this.moduleInNeighbors.set(moduleId, new Set());
  }

  addModuleDependency(from: ModuleId, to: ModuleId) {
    this.addModule(from);
    this.addModule(to);
    this.moduleOutNeighbors.get(from)!.add(to);
    this.moduleInNeighbors.get(to)!.add(from);
  }

  linkFileToModule(fileId: FileId, moduleId: ModuleId) {
    if (!this.fileToModules.has(fileId)) this.fileToModules.set(fileId, new Set());
    this.fileToModules.get(fileId)!.add(moduleId);
    if (!this.moduleOutNeighbors.has(moduleId)) this.moduleOutNeighbors.set(moduleId, new Set());
    if (!this.moduleInNeighbors.has(moduleId)) this.moduleInNeighbors.set(moduleId, new Set());
  }

  getModulesForFile(fileId: FileId): Set<ModuleId> {
    return new Set(this.fileToModules.get(fileId) || []);
  }

  getDirectFileDeps(fileId: FileId): Set<FileId> {
    // for each module in file, find modules it depends on and return files owning those modules
    const deps: Set<FileId> = new Set();
    const modules = this.fileToModules.get(fileId);
    if (!modules) return deps;
    modules.forEach((mod) => {
      const out = this.moduleOutNeighbors.get(mod);
      if (!out) return;
      out.forEach((depMod) => {
        // find files that own depMod
        for (const [f, mods] of this.fileToModules.entries()) {
          if (mods.has(depMod)) deps.add(f);
        }
      });
    });
    return deps;
  }

  getReverseClosure(fileSet: Set<FileId>, depth: number = Infinity): Set<FileId> {
    // returns all files that transitively depend on the given fileSet
    const result: Set<FileId> = new Set(fileSet);
    let frontier = new Set(fileSet);
    let d = 0;
    while (frontier.size && d < depth) {
      const next: Set<FileId> = new Set();
      // for every file in frontier, find files that import modules defined by that file
      for (const f of frontier) {
        // modules this file defines
        const modset = this.fileToModules.get(f);
        if (!modset) continue;
        // find modules which have incoming edges from modset
        for (const mod of modset) {
          const inNeighbors = this.moduleInNeighbors.get(mod);
          if (!inNeighbors) continue;
          inNeighbors.forEach((m2) => {
            // find files that define m2 (these files depend on file f)
            for (const [fileB, modsB] of this.fileToModules.entries()) {
              if (modsB.has(m2) && !result.has(fileB)) {
                next.add(fileB);
              }
            }
          });
        }
      }
      next.forEach((nf) => result.add(nf));
      frontier = next;
      d += 1;
    }
    return result;
  }

  getDirectDepsGraphFileLevel(): Map<FileId, Set<FileId>> {
    const graph: Map<FileId, Set<FileId>> = new Map();
    for (const [file, modules] of this.fileToModules.entries()) {
      const deps = new Set<FileId>();
      for (const m of modules) {
        const out = this.moduleOutNeighbors.get(m);
        if (!out) continue;
        out.forEach((depMod) => {
          for (const [f, mods] of this.fileToModules.entries()) {
            if (mods.has(depMod)) deps.add(f);
          }
        });
      }
      graph.set(file, deps);
    }
    return graph;
  }
}
