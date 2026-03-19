import { ProjectProfile } from "../types";

const cpp: ProjectProfile = {
  id: "cpp-default",
  name: "C / C++",
  detectFiles: ["Makefile", "CMakeLists.txt", "configure.ac"],
  customDetect: (root, fs, path) => {
    try {
      if (fs.existsSync(path.join(root, "Source")) && fs.existsSync(path.join(root, "Content")) && fs.readdirSync(root).some((f: string) => f.endsWith(".uproject"))) {
        return "Unreal Engine";
      }
      const cmakePath = path.join(root, "CMakeLists.txt");
      if (fs.existsSync(cmakePath)) {
        const content = fs.readFileSync(cmakePath, "utf8");
        if (content.includes("find_package(Qt")) return "Qt";
        if (content.includes("cuda_")) return "CUDA";
        return "CMake";
      }
      return null;
    } catch { return null; }
  },
  targetExts: [".c", ".cpp", ".cc", ".h", ".hpp"],
  ignoreFolders: ["build", "bin", "obj", ".vscode-ctags"],
  analysisLogic: "C++ Logic",
  logicFeatures: "Standard project analysis rules",
  icon: "📦"
};

export default [cpp];
