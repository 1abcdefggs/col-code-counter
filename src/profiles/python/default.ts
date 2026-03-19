import { ProjectProfile } from "../types";

const getPythonContent = (root: string, fs: any, path: any) => {
  const requirements = fs.existsSync(path.join(root, "requirements.txt")) 
    ? fs.readFileSync(path.join(root, "requirements.txt"), "utf8") 
    : "";
  const pyproject = fs.existsSync(path.join(root, "pyproject.toml"))
    ? fs.readFileSync(path.join(root, "pyproject.toml"), "utf8")
    : "";
  return (requirements + pyproject).toLowerCase();
};

const django: ProjectProfile = {
  id: "django",
  name: "Django",
  detectFiles: ["manage.py", "requirements.txt"],
  customDetect: (root, fs, path) => {
    if (!fs.existsSync(path.join(root, "manage.py"))) return null;
    const content = getPythonContent(root, fs, path);
    return content.includes("django") ? "Django Web App" : null;
  },
  targetExts: [".py", ".html", ".json"],
  ignoreFolders: ["__pycache__", "staticfiles", "media", "migrations"],
  dependencyFolders: [".venv", "venv"],
  analysisLogic: "Django Logic",
  logicFeatures: "Django-specific rules (ignores staticfiles, media, migrations)",
  icon: "🐎"
};

const fastapi: ProjectProfile = {
  id: "fastapi",
  name: "FastAPI",
  detectFiles: ["requirements.txt", "pyproject.toml"],
  customDetect: (root, fs, path) => {
    const content = getPythonContent(root, fs, path);
    return content.includes("fastapi") ? "FastAPI Backend" : null;
  },
  targetExts: [".py", ".json"],
  ignoreFolders: ["__pycache__", "app/static", "app/templates"],
  dependencyFolders: [".venv", "venv"],
  analysisLogic: "FastAPI Logic",
  logicFeatures: "FastAPI backend analysis",
  icon: "⚡"
};

const dataScience: ProjectProfile = {
  id: "data-science",
  name: "Data Science",
  detectFiles: ["requirements.txt", "pyproject.toml"],
  customDetect: (root, fs, path) => {
    const content = getPythonContent(root, fs, path);
    if (content.includes("pytorch") || content.includes("torch")) return "PyTorch Project";
    if (content.includes("tensorflow")) return "TensorFlow Project";
    if (content.includes("sklearn") || content.includes("scikit-learn")) return "Scikit-Learn Project";
    return null;
  },
  targetExts: [".py", ".ipynb", ".json", ".csv"],
  ignoreFolders: ["__pycache__", ".ipynb_checkpoints", "data/raw", "data/processed"],
  dependencyFolders: [".venv", "venv", "env"],
  analysisLogic: "Data Science Logic",
  logicFeatures: "Optimized for Jupyter Notebooks and ML models",
  icon: "🔬"
};

const pythonGeneric: ProjectProfile = {
  id: "python-generic",
  name: "Python",
  detectFiles: ["requirements.txt", "pyproject.toml", "setup.py", "Pipfile"],
  targetExts: [".py"],
  ignoreFolders: ["__pycache__"],
  dependencyFolders: [".venv", "venv", "env"],
  analysisLogic: "Generic Python Logic",
  logicFeatures: "Standard Python project rules",
  icon: "🐍"
};

export default [django, fastapi, dataScience, pythonGeneric];
