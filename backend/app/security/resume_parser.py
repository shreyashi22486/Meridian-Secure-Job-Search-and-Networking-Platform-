"""
Resume parsing module — extract text from PDFs and identify skills.

Uses PyPDF2 for text extraction and keyword matching against a
curated skills dictionary for skill identification.

Security note: Parsing operates on in-memory decrypted bytes only.
No decrypted content is ever written to disk.
"""

import re
from io import BytesIO
from PyPDF2 import PdfReader


# ─── Curated skills dictionary ─────────────────────────────────────────
# Organized by category for maintainability. All matched case-insensitively.

SKILLS_DATABASE = {
    # Programming Languages
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go",
    "rust", "ruby", "php", "swift", "kotlin", "scala", "r", "matlab",
    "perl", "lua", "dart", "haskell", "shell", "bash", "powershell",

    # Web Frameworks & Libraries
    "react", "react.js", "reactjs", "angular", "vue", "vue.js", "vuejs",
    "next.js", "nextjs", "nuxt.js", "express", "express.js", "django",
    "flask", "fastapi", "spring", "spring boot", "rails", "ruby on rails",
    "laravel", "asp.net", ".net", "node.js", "nodejs", "svelte",

    # Frontend
    "html", "css", "sass", "scss", "tailwind", "tailwindcss", "bootstrap",
    "jquery", "webpack", "vite", "responsive design", "figma", "ui/ux",

    # Databases
    "sql", "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite",
    "oracle", "cassandra", "dynamodb", "elasticsearch", "neo4j", "firebase",
    "mariadb", "couchdb",

    # Cloud & DevOps
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "k8s",
    "terraform", "ansible", "jenkins", "ci/cd", "github actions",
    "gitlab ci", "heroku", "vercel", "netlify", "nginx", "apache",
    "linux", "unix", "cloudformation",

    # Data Science & ML
    "machine learning", "deep learning", "nlp", "natural language processing",
    "computer vision", "tensorflow", "pytorch", "keras", "scikit-learn",
    "pandas", "numpy", "scipy", "matplotlib", "data analysis",
    "data visualization", "tableau", "power bi", "jupyter",
    "artificial intelligence", "ai", "ml", "statistics",

    # Mobile
    "android", "ios", "react native", "flutter", "swiftui", "xamarin",

    # Tools & Practices
    "git", "github", "gitlab", "bitbucket", "jira", "confluence",
    "agile", "scrum", "kanban", "rest", "restful", "graphql", "grpc",
    "microservices", "api design", "testing", "unit testing", "tdd",
    "selenium", "cypress", "postman",

    # Security
    "cybersecurity", "penetration testing", "encryption", "owasp",
    "network security", "information security", "soc", "siem",

    # Big Data
    "hadoop", "spark", "kafka", "airflow", "etl", "data engineering",
    "data warehousing", "snowflake", "databricks",

    # Soft Skills
    "communication", "leadership", "teamwork", "problem solving",
    "project management", "critical thinking", "time management",
    "presentation", "analytical", "research",

    # Other Tech
    "blockchain", "solidity", "web3", "devops", "devsecops",
    "system design", "distributed systems", "networking", "tcp/ip",
    "oauth", "jwt", "saas", "erp", "crm", "salesforce",
}

# Pre-compile multi-word skills for efficient matching (sorted longest first)
_MULTI_WORD_SKILLS = sorted(
    [s for s in SKILLS_DATABASE if " " in s or "/" in s or "." in s],
    key=len, reverse=True,
)
_SINGLE_WORD_SKILLS = {s for s in SKILLS_DATABASE if " " not in s and "/" not in s and "." not in s}


def _do_extract(pdf_bytes: bytes) -> str:
    """Inner extraction function — runs in a thread with timeout."""
    reader = PdfReader(BytesIO(pdf_bytes))
    text_parts = []
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text_parts.append(page_text)
    return "\n".join(text_parts)


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract all text from a PDF file (in-memory bytes).
    Returns the full text as a single string.
    Enforces a 10-second timeout to prevent DoS from crafted PDFs (A8.3).
    """
    from concurrent.futures import ThreadPoolExecutor, TimeoutError
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_do_extract, pdf_bytes)
            return future.result(timeout=10)
    except TimeoutError:
        return ""
    except Exception:
        return ""


def extract_skills(text: str) -> list[str]:
    """
    Extract skills from resume text by matching against the skills database.

    Strategy:
    1. First, find multi-word/special skills (e.g., "machine learning", "ci/cd")
    2. Then, tokenize remaining text and match single-word skills
    3. Return deduplicated, sorted list of matched skills (lowercased)
    """
    if not text:
        return []

    text_lower = text.lower()
    found_skills: set[str] = set()

    # 1. Match multi-word / special-character skills first
    for skill in _MULTI_WORD_SKILLS:
        # Use word-boundary-aware search
        pattern = re.escape(skill)
        if re.search(rf"(?<!\w){pattern}(?!\w)", text_lower):
            found_skills.add(skill)

    # 2. Tokenize and match single-word skills
    # Split on non-alphanumeric (except #, +, .) to preserve "c#", "c++", ".net"
    tokens = set(re.findall(r"[a-z0-9#+.]+", text_lower))
    for token in tokens:
        if token in _SINGLE_WORD_SKILLS:
            found_skills.add(token)

    return sorted(found_skills)


def parse_resume(pdf_bytes: bytes) -> list[str]:
    """
    Full pipeline: PDF bytes → text → extracted skills list.
    This is the main entry point for resume parsing.
    """
    text = extract_text_from_pdf(pdf_bytes)
    return extract_skills(text)
