# PolyLingo - Your Intelligent Language Learning Partner

<p align="center">
  <img src="https://img.shields.io/badge/Language%20Learning-AI%20Powered-blue?style=for-the-badge" alt="AI Powered">
  <img src="https://img.shields.io/badge/Platform-Web-green?style=for-the-badge" alt="Web Platform">
  <img src="https://img.shields.io/badge/Offline%20First-IndexedDB-orange?style=for-the-badge" alt="Offline First">
</p>

<p align="center">
  <b>A Personalized Language Learning Platform Based on AI Extraction, SRS Spaced Repetition, and Intelligent Testing</b>
</p>

---

## 📖 Project Introduction

**PolyLingo** is an open-source web application designed for language learners. It uses AI technology to extract learning entries (words, phrases, sentences) from any text material, combined with a scientific SRS (Spaced Repetition System) algorithm to help you memorize efficiently. Whether you are a beginner or an advanced learner, PolyLingo can provide you with a personalized learning experience.

---

## ✨ Core Features

### 1. 🤖 AI Smart Extraction
- **Custom Language Support**: Not only supports default languages like German, Japanese, and English, but also allows adding any language you want to learn
- **Smart Prompt Configuration**: Customize AI extraction requirements for each language (such as part-of-speech tagging, grammar explanations, usage scenarios, etc.)
- **Batch Import**: Upload text files in TXT, Markdown, and other formats; AI automatically extracts learning entries
- **Article Processing**: Paste articles directly; AI will identify and extract key vocabulary and expressions

### 2. 📚 Learning Entry Management
- **Three Entry Types**: Word, Phrase, and Sentence
- **Rich Text Explanations**: Custom modules support Markdown format for detailed explanations (tables, lists, headers, etc.)
- **Example Sentences**: Each entry can include example sentences to help understand usage
- **Multi-Module Management**: Learn multiple languages simultaneously with independent management for each

### 3. 🔄 SRS Spaced Repetition Review
- **Scientific Algorithm**: Spaced repetition system based on the SM-2 algorithm; automatically calculates next review time
- **Daily Review Plan**: Generate daily review tasks based on your settings
- **Real-time Timing**: Automatically records learning duration during review
- **Progress Tracking**: Clear learning statistics and calendar view
- **Mixed Review**: Support single-language review or multi-language mixed review with flexible selection

### 4. 📝 Intelligent Testing System
- **Three Question Types**:
  - **Multiple Choice**: Choose the correct answer from options
  - **Fill in the Blank**: Fill in the correct vocabulary based on context
  - **Translation**: Translate between Chinese and the target language
- **AI-Generated Questions**: Intelligently generates test questions based on your learning entries
- **Language Selection**: Choose specific languages or mix multiple languages for testing
- **Wrong Answer Review**: Review wrong answers and detailed explanations after the test
- **History Records**: Save all test records and track progress curves

### 5. 📰 News Fetching (Built-in Material Source)
- **German**: ZDF Heute News
- **English**: BBC News, The Guardian, NPR
- **Automatic Extraction**: Automatically calls AI to extract learning entries after fetching news

### 6. 🔧 Highly Configurable
- **API Configuration**: Supports services compatible with the OpenAI API format (OpenAI, GLM, Claude, etc.)
- **Daily Learning Volume**: Customize the number of daily review entries
- **Prompt Templates**: Provides reference Prompts for French, Korean, etc.; also fully customizable

---

## 🎯 User Experience

### For Beginners
- Upload textbooks or articles; AI automatically extracts vocabulary to learn
- Understand usage through example sentences and detailed explanations
- Daily review tasks are clear and not overwhelming
- Test functionality helps check learning results

### For Advanced Learners
- Add articles from professional fields to extract professional terminology
- Customize Prompts for deeper linguistic analysis (etymology, grammatical structure, stylistic distinctions, etc.)
- Use Markdown format to write detailed study notes
- Maintain proficiency in multiple languages through mixed review

### For Multi-Language Learners
- Manage learning of multiple languages in one application
- Flexibly switch learning modules
- Mixed review feature allows you to encounter multiple languages in one review session
- Statistics displayed separately for clear understanding of each language's learning progress

---

## 🚀 Quick Start

### Method 1: Use Directly (Recommended)

Visit the deployed online version (if available), or follow Method 2 to run locally.

### Method 2: Run Locally

#### Step 1: Download the Project

```bash
# Clone the repository
git clone https://github.com/ReoNa0216/PolyLingo.git

# Enter the project directory
cd PolyLingo
```

Or directly click **Code** → **Download ZIP** on the GitHub page and extract it locally.

#### Step 2: Run Locally

Since PolyLingo is a pure frontend application (using IndexedDB for local storage), you can open it directly in your browser:

```bash
# Method 1: Use Python simple HTTP server (recommended)
# Python 3
python -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

Then visit `http://localhost:8080`

```bash
# Method 2: Use Node.js http-server
npx http-server -p 8080
```

```bash
# Method 3: Use VS Code Live Server extension
# Right-click index.html in VS Code → "Open with Live Server"
```

**Note**: Opening `index.html` directly by double-clicking may cause some functions to not work properly (browser security restrictions). It is recommended to use the above methods to run a local server.

#### Step 3: Configure AI API

1. After opening the application for the first time, click the **Settings** icon in the upper right corner
2. Fill in the following information:
   - **API URL**: Your AI service address (e.g., OpenAI: `https://api.openai.com/v1`, or GLM: `https://open.bigmodel.cn/api/paas/v4`)
   - **API Key**: Your API key
   - **Model Name**: Such as `gpt-4`, `gpt-3.5-turbo`, `glm-4`, etc.
   - **Max Tokens**: Recommended to set to 4000-8000 to ensure long text can be processed
3. Click **Save Settings**

#### Step 4: Start Learning

##### Add Language Modules

1. Click the **+** button at the bottom of the left sidebar
2. Select a preset language (German/Japanese/English) or click **Add Custom Language**
3. For custom languages:
   - Fill in the language name (e.g., "Korean")
   - Set the flag icon (emoji, such as 🇰🇷)
   - Configure AI Prompt (refer to examples in the `prompt-examples` folder)
   - Click **Save**

##### Upload Learning Materials

1. Select the language module you want to learn
2. Click **Upload Materials** or drag files into the upload area
3. Supported formats: TXT, Markdown
4. AI will automatically extract learning entries; wait for processing to complete

##### Start Reviewing

1. Click **Start Review Now** on the home page, or select a specific language in the sidebar and click **Start Review**
2. View the front (original text) and think about the answer
3. Click **Show Answer** to see the translation and explanation
4. Choose based on your level of mastery:
   - **Hard**: Will be reviewed again soon
   - **Normal**: Review at normal intervals
   - **Easy**: Extend the review interval

##### Generate Tests

1. Click the **Test** button in the sidebar, or click **Start Test Now** on the home page
2. Select the languages to test (multiple selection allowed)
3. Select question types and quantities:
   - Multiple Choice (choose one from four)
   - Fill in the Blank
   - Translation
4. Click **Start Test**
5. View score and wrong answer analysis after completion

##### View Statistics

- **Learning Statistics**: Charts showing learning duration, review volume, and test score trends
- **Calendar View**: View daily learning activities
- **Module Details**: Learning progress, entry count, and pending review count for each language

---

## 📁 Project Structure

```
PolyLingo/
├── index.html          # Main page
├── app.js              # Main application logic
├── backend/            # Optional backend proxy service (for news fetching)
│   ├── index.js
│   ├── package.json
│   └── vercel.json
├── prompt-examples/    # Prompt reference examples
│   ├── 法语参考prompt.txt
│   └── 韩语参考prompt.txt
├── RAILWAY_DEPLOY.md   # Railway deployment guide
└── README.md           # This file
```

---

## ⚙️ Advanced Configuration

### Custom AI Prompts

When adding custom languages, you can configure three types of Prompts:

1. **Word Extraction Prompt**: Tell AI how to extract and format word entries
2. **Phrase Extraction Prompt**: Tell AI how to extract and format phrase entries
3. **Sentence Extraction Prompt**: Tell AI how to extract and format sentence entries

You can use placeholders in Prompts, such as `{{word}}`, `{{translation}}`, `{{explanation}}`, etc. The system will automatically replace them with specific requirements.

### Backend Proxy Deployment (Optional)

If you need to use the news fetching feature, you can deploy the backend proxy service to Vercel:

```bash
cd backend
npm install -g vercel
vercel login
vercel
```

After deployment, configure the obtained URL into `API_BASE_URL` in the frontend code.

---

## 🐛 FAQ

**Q: Why does AI extraction fail?**  
A: Please check: 1) Is the API Key correct; 2) Is the API URL complete (needs to include `/v1`); 3) Is there sufficient balance.

**Q: Where is data stored?**  
A: All data is stored in the browser's IndexedDB, completely local, and will not be uploaded to the server.

**Q: How to backup data?**  
A: Currently requires manual export. It is recommended to regularly backup browser data or wait for a future version to add export functionality.

**Q: Is mobile supported?**  
A: Yes, the interface is responsively adapted, but it is recommended to use on desktop for the best experience.

---

## 🤝 Contribution and Feedback

PolyLingo is an open-source project; suggestions and feedback are welcome!

- Encountered a problem? Please describe it in GitHub Issues
- Have a new feature idea? Feel free to submit a Feature Request
- Want to contribute code? Fork this repository and submit a Pull Request

Your suggestions will help make PolyLingo better!

---

## 📄 License Statement

**This project is not currently intended for commercial use.**

If used for commercial purposes without authorization, the author will pursue liability upon discovery.

This project is licensed under an open-source license (specific license to be added) and is for personal learning and communication use only.

---

## 🙏 Acknowledgments

Thanks to all users who provided suggestions and feedback for PolyLingo!

**Happy Learning! 🎉**
