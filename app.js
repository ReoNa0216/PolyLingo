/**
 * PolyLingo - Language Learning Assistant
 * Main Application Logic
 */

// Database Setup
const db = new Dexie('PolyLingoDB');

// Define database schema - version 5 with auto-increment keys
db.version(5).stores({
  modules: '++id, name, language, createdAt',
  materials: '++id, moduleId, title, content, sourceFile, createdAt',
  entries: '++id, materialId, moduleId, type, original, translation, srsLevel, nextReview, interval, createdAt',
  cards: '++id, materialId, content, srsLevel, nextReview, interval, createdAt',
  tests: '++id, moduleId, questions, answers, results, score, duration, createdAt',
  records: '++id, date, moduleId, duration, action, createdAt',
  settings: '++id, value'
});

// Application State
const app = {
  currentModule: null,
  currentView: 'dashboard',
  reviewQueue: [],
  currentReviewIndex: 0,
  testData: null,
  charts: {},
  calendar: null,
  isInitialized: false,  // 防止重复初始化
  customModulesRendered: false,  // 防止重复渲染自定义模块
  
  // ZDF Heute 新闻获取状态（德语）
  zdfCurrentArticle: null,
  fetchedZDFFeeds: [], // 已获取的ZDF文章链接
  
  // BBC News 新闻获取状态（英语）
  bbcCurrentArticle: null,
  fetchedBBCFeeds: [], // 已获取的BBC文章链接
  bbcCategory: 'world', // 默认栏目: world|business|technology|science|health
  
  // NPR News 新闻获取状态（英语）
  nprCurrentArticle: null,
  fetchedNPRFeeds: [], // 已获取的NPR文章链接
  nprCategory: 'news', // 默认栏目: news|world|usa|business|science|health|tech
  
  // The Guardian 新闻获取状态（英语）
  guardianCurrentArticle: null,
  
  // 学习时长实时跟踪
  studyStartTime: null,
  studyTimer: null,
  currentStudyMinutes: 0,
  
  // 混合复习时按语言分别计时
  moduleStudyTimes: {}, // { moduleId: minutes }
  currentCardStartTime: null,
  currentCardModuleId: null,
  fetchedGuardianFeeds: [], // 已获取的Guardian文章链接
  guardianCategory: 'world', // 默认栏目: world|uk|us|business|science|technology|culture
  
  // 批量删除状态
  batchMode: { word: false, phrase: false, sentence: false },
  selectedEntries: { word: new Set(), phrase: new Set(), sentence: new Set() },
  
  // 朝日新聞 获取状态（日语）
  asahiCurrentArticle: null,
  fetchedAsahiFeeds: [], // 已获取的朝日新聞文章链接
  
  // Module definitions
  modules: {
    german: { id: 'german', name: '德语', language: 'German', flag: 'de', code: 'DE' },
    japanese: { id: 'japanese', name: '日语', language: 'Japanese', flag: 'jp', code: 'JP' },
    english: { id: 'english', name: '英语', language: 'English', flag: 'gb', code: 'EN' }
  },
  
  // SRS Intervals (in days) - SM-2 Algorithm
  srsIntervals: [1, 3, 7, 14, 30, 90, 180],
  
  // Initialize
  async init() {
    // 防止重复初始化 - 多重保护
    if (this.isInitialized || window.appInitialized) {
      console.log('App already initialized, skipping...');
      return;
    }
    
    // 标记开始初始化
    this.isInitialized = true;
    window.appInitialized = true;
    
    console.log('Initializing app...');
    
    try {
      // 清理可能的重复元素（针对 Edge 浏览器刷新问题）
      this.cleanupDuplicateElements();
      
      // 尝试打开数据库
      await db.open();
      
      await this.initModules();
      await this.loadCustomModules();
      await this.loadDashboard();
      await this.updateSidebarStats();
      this.setupEventListeners();
      
      // 加载新闻抓取历史
      this.loadZDFHistory();
      this.loadBBCHistory();
      this.loadNPRHistory();
      this.loadGuardianHistory();
      
      console.log('App initialized successfully');
    } catch (error) {
      console.error('Init error:', error);
      
      // 检测数据库升级错误
      if (error.name === 'UpgradeError' || (error.message && (error.message.includes('primary key') || error.message.includes('changing primary key')))) {
        const shouldReset = confirm('检测到数据库结构需要更新。\n\n点击"确定"清空本地数据库并刷新页面（如有重要数据请先备份），或点击"取消"手动刷新。');
        if (shouldReset) {
          await db.delete();
          location.reload();
          return;
        }
      }
      
      // 如果初始化失败，重置状态允许重试
      this.isInitialized = false;
      window.appInitialized = false;
    }
  },
  
  // 清理可能的重复元素
  cleanupDuplicateElements() {
    console.log('Cleaning up duplicate elements...');
    
    // 清理重复的自定义模块导航按钮
    const navContainer = document.getElementById('custom-modules-nav');
    if (navContainer) {
      const seenIds = new Set();
      const buttons = navContainer.querySelectorAll('button');
      buttons.forEach(btn => {
        if (seenIds.has(btn.id)) {
          console.log(`Removing duplicate nav button: ${btn.id}`);
          btn.remove();
        } else {
          seenIds.add(btn.id);
        }
      });
    }
    
    // 清理重复的仪表盘卡片
    const dashboardCards = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4');
    if (dashboardCards) {
      const seenCardIds = new Set();
      const cards = dashboardCards.querySelectorAll('[id^="card-"]');
      cards.forEach(card => {
        if (seenCardIds.has(card.id)) {
          console.log(`Removing duplicate card: ${card.id}`);
          card.remove();
        } else {
          seenCardIds.add(card.id);
        }
      });
    }
  },
  
  // Initialize default modules
  async initModules() {
    // 清理已删除的默认模块（不在当前代码定义中的）
    const allModules = await db.modules.toArray();
    const validModuleIds = new Set(Object.keys(this.modules));
    for (const mod of allModules) {
      if (mod.isDefault && !validModuleIds.has(mod.id)) {
        console.log('Removing obsolete default module:', mod.id);
        await db.modules.delete(mod.id);
      }
    }
    
    for (const key in this.modules) {
      const mod = this.modules[key];
      const existing = await db.modules.get(mod.id);
      if (!existing) {
        await db.modules.put({
          id: mod.id,
          name: mod.name,
          language: mod.language,
          isDefault: true,
          createdAt: new Date()
        });
      }
    }
  },
  
  // Load custom modules from database - called once on init
  async loadCustomModules() {
    // 防止重复加载
    if (this.customModulesRendered) {
      console.log('Custom modules already loaded, skipping...');
      return;
    }
    
    const customModules = await db.modules.filter(m => !m.isDefault).toArray();
    console.log(`Loading ${customModules.length} custom modules...`);
    
    for (const mod of customModules) {
      // 检查是否已经存在该模块（防止重复添加）
      if (!this.modules[mod.id]) {
        this.modules[mod.id] = {
          id: mod.id,
          name: mod.name,
          language: mod.language,
          code: mod.code || mod.id.substring(0, 2).toUpperCase(),
          flag: mod.flag || 'un',
          customPrompt: mod.customPrompt,
          isCustom: true
        };
      }
    }
    
    // 只渲染一次
    if (customModules.length > 0 && !this.customModulesRendered) {
      this.renderCustomModules();
      this.customModulesRendered = true;
    }
  },
  
  // Render custom modules in sidebar and dashboard - only called once on init
  renderCustomModules() {
    const customMods = Object.values(this.modules).filter(m => m.isCustom);
    if (customMods.length === 0) return;
    
    // Render in sidebar - only custom modules
    const navContainer = document.getElementById('custom-modules-nav');
    if (navContainer) {
      // Clear first to avoid duplicates
      navContainer.innerHTML = '';
      customMods.forEach(mod => {
        const btn = document.createElement('button');
        btn.id = `nav-${mod.id}`;
        btn.className = 'nav-item w-full px-4 py-3 flex items-center gap-3 hover:bg-primary-800 transition-colors';
        btn.onclick = () => app.switchModule(mod.id);
        btn.innerHTML = `
          <span class="fi fi-${mod.flag || 'un'} w-8 h-6 rounded shadow-sm"></span>
          <div class="text-left">
            <div class="font-medium">${mod.name}</div>
            <div class="text-xs text-primary-400" id="${mod.id}-count">0 条目</div>
          </div>
        `;
        navContainer.appendChild(btn);
      });
    }
    
    // Render in dashboard cards - only custom modules
    const dashboardCards = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3');
    if (dashboardCards) {
      customMods.forEach(mod => {
        // Skip if already exists
        if (document.getElementById(`card-${mod.id}`)) return;
        
        const card = document.createElement('div');
        card.id = `card-${mod.id}`;
        card.onclick = () => app.switchModule(mod.id);
        card.className = 'module-card bg-white rounded-xl p-6 shadow-lg cursor-pointer border border-primary-100';
        card.innerHTML = `
          <div class="flex items-center justify-between mb-4">
            <div class="w-16 h-12 rounded-lg shadow-lg overflow-hidden">
              <span class="fi fi-${mod.flag || 'un'} w-full h-full"></span>
            </div>
            <div class="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
              <span class="text-primary-600 font-bold text-sm" id="${mod.id}-progress">0%</span>
            </div>
          </div>
          <h4 class="text-xl font-bold mb-1">${mod.name}</h4>
          <p class="text-sm text-primary-500 mb-3">${mod.language}</p>
          <div class="flex items-center justify-between text-sm">
            <span class="text-primary-600"><span id="${mod.id}-entries">0</span> 条目</span>
            <span class="text-accent-600"><span id="${mod.id}-due">0</span> 待复习</span>
          </div>
          <div class="mt-4 w-full bg-primary-100 rounded-full h-2">
            <div id="${mod.id}-bar" class="bg-primary-600 h-2 rounded-full transition-all" style="width: 0%"></div>
          </div>
          <button onclick="event.stopPropagation(); app.deleteModule('${mod.id}')" class="mt-3 w-full px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm transition-colors">
            删除模块
          </button>
        `;
        dashboardCards.appendChild(card);
      });
    }
  },
  
  
  
  // Setup event listeners
  setupEventListeners() {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (this.currentView === 'review') {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.flipCard();
        } else if (e.key >= '1' && e.key <= '4') {
          const rating = parseInt(e.key);
          const ratingDiv = document.getElementById('rating-controls');
          if (!ratingDiv.classList.contains('hidden')) {
            this.rateCard(rating);
          }
        }
      }
    });
  },
  
  // View Management
  hideAllViews() {
    ['dashboard-view', 'module-view', 'review-view', 'test-view', 'calendar-view', 'stats-view'].forEach(id => {
      document.getElementById(id).classList.add('hidden');
    });
    document.getElementById('review-btn').classList.add('hidden');
    document.getElementById('test-btn').classList.add('hidden');
    document.getElementById('module-badge').classList.add('hidden');
  },
  
  async switchModule(moduleId) {
    this.currentModule = moduleId;
    this.hideAllViews();
    document.getElementById('module-view').classList.remove('hidden');
    document.getElementById('review-btn').classList.remove('hidden');
    document.getElementById('test-btn').classList.remove('hidden');
    
    const mod = this.modules[moduleId];
    document.getElementById('page-title').textContent = mod.name;
    
    // 更新模块标签 - 使用国旗图标
    const flagEl = document.getElementById('module-flag');
    const langEl = document.getElementById('module-lang');
    if (flagEl && langEl) {
      flagEl.className = `fi fi-${mod.flag || 'un'}`;
      langEl.textContent = mod.language;
    }
    document.getElementById('module-badge').classList.remove('hidden');
    
    // 更新批量导入的placeholder和提示
    const bulkTextarea = document.getElementById('bulk-import-text');
    const aiHint = document.getElementById('ai-hint-text');
    const isDefaultModule = ['german', 'japanese', 'english'].includes(moduleId);
    
    if (bulkTextarea) {
      if (isDefaultModule) {
        // 默认模块显示详细示例
        const examples = {
          german: `Depression
Sorgen
Unterstützung
Symptom
Traurigkeit`,
          english: `depression
anxiety
support
symptom
coping`,
          japanese: `うつ病
不安
支援
症状
心理的`
        };
        const placeholderText = examples[moduleId] || examples.english;
        bulkTextarea.placeholder = `粘贴单词列表，每行一个或空格分隔，AI将自动识别词性并补全信息

示例：
${placeholderText}`;
      } else {
        // 非默认模块简化显示
        bulkTextarea.placeholder = `输入需要学习的内容，每行一个或空格分隔`;
      }
    }
    
    // 更新AI提示文本
    if (aiHint) {
      if (isDefaultModule) {
        const hints = {
          german: '💡 AI将自动识别词性（如名词der/die/das、动词等）并生成中文翻译和例句',
          english: '💡 AI将自动识别词性（如名词、动词等）并生成中文翻译和例句',
          japanese: '💡 AI将自动识别词性（他动词·五段/一段、自动词·五段/一段、名词、い形容词、な形容动词等），为汉字标注平假名读音，并生成中文翻译和例句'
        };
        aiHint.textContent = hints[moduleId] || hints.english;
      } else {
        // 非默认模块显示用户自定义提示
        const customPrompt = mod.customPrompt;
        if (customPrompt) {
          aiHint.innerHTML = `💡 自定义提取要求：${customPrompt.substring(0, 50)}${customPrompt.length > 50 ? '...' : ''}`;
        } else {
          aiHint.textContent = '💡 AI将根据输入内容自动补全信息';
        }
      }
    }
    
    // 更新新闻源导入区域
    this.renderNewsImport(moduleId);
    
    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('bg-primary-800'));
    const navEl = document.getElementById(`nav-${moduleId}`);
    if (navEl) navEl.classList.add('bg-primary-800');
    
    await this.loadModuleMaterials();
    this.currentView = 'module';
  },
  
  async loadDashboard() {
    this.hideAllViews();
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = '仪表盘';
    document.getElementById('module-badge').classList.add('hidden');
    this.currentView = 'dashboard';
    this.currentModule = null; // 重置为混合模式
    
    // Update module stats - 基于学习条目
    for (const key in this.modules) {
      const mod = this.modules[key];
      
      const materials = await db.materials.where('moduleId').equals(mod.id).toArray();
      const entries = await db.entries.where('moduleId').equals(mod.id).toArray();
      const dueEntries = entries.filter(e => new Date(e.nextReview) <= new Date());
      const reviewedEntries = entries.filter(e => e.srsLevel > 0);
      
      document.getElementById(`${mod.id}-count`).textContent = `${entries.length} 条目`;
      document.getElementById(`${mod.id}-entries`).textContent = entries.length;
      document.getElementById(`${mod.id}-due`).textContent = dueEntries.length;
      
      const progress = entries.length > 0 ? Math.round((reviewedEntries.length / entries.length) * 100) : 0;
      document.getElementById(`${mod.id}-progress`).textContent = `${progress}%`;
      document.getElementById(`${mod.id}-bar`).style.width = `${progress}%`;
    }
    
    // Update due count - calculate actual total due entries across all modules
    const allEntries = await db.entries.toArray();
    const totalDue = allEntries.filter(e => new Date(e.nextReview) <= new Date()).length;
    document.getElementById('due-count').textContent = totalDue;
    
    // Load recent activity
    await this.loadRecentActivity();
  },
  
  async loadRecentActivity() {
    const records = await db.records.orderBy('createdAt').reverse().limit(10).toArray();
    const container = document.getElementById('recent-activity');
    
    if (records.length === 0) {
      container.innerHTML = '<p class="text-primary-500 text-center py-4">暂无学习记录</p>';
      return;
    }
    
    container.innerHTML = records.map(r => `
      <div class="flex items-center justify-between py-2 border-b border-primary-100 last:border-0 group">
        <div class="flex items-center gap-3">
          <span class="text-lg">${this.getActionIcon(r.action)}</span>
          <div>
            <div class="font-medium">${this.getActionText(r.action)}</div>
            <div class="text-xs text-primary-500">${(this.modules[r.moduleId] && this.modules[r.moduleId].name) || '混合'}</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-right text-sm text-primary-500">
            <div>${new Date(r.createdAt).toLocaleDateString()}</div>
            <div>${r.duration}分钟</div>
          </div>
          <button onclick="app.deleteRecord('${r.id}')" class="opacity-0 group-hover:opacity-100 text-primary-400 hover:text-red-500 transition-all" title="删除记录">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  },
  
  async deleteRecord(recordId) {
    if (!confirm('确定要删除这条学习记录吗？')) return;
    
    try {
      await db.records.delete(recordId);
      await this.loadRecentActivity();
      await this.updateSidebarStats();
    } catch (error) {
      console.error('Delete record failed:', error);
      alert('删除失败: ' + error.message);
    }
  },
  
  getActionIcon(action) {
    const icons = { review: '📚', test: '📝', upload: '📤', study: '💡' };
    return icons[action] || '📌';
  },
  
  getActionText(action) {
    const texts = { review: '完成复习', test: '完成测试', upload: '上传材料', study: '学习材料' };
    return texts[action] || action;
  },
  
  // File Upload & Parsing
  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  },
  
  handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    this.processFiles(files);
  },
  
  handleFileSelect(e) {
    const files = e.target.files;
    this.processFiles(files);
  },
  
  async processFiles(files) {
    if (!this.currentModule) {
      alert('请先选择一个学习模块');
      return;
    }
    
    for (const file of files) {
      try {
        const content = await this.parseFile(file);
        await this.saveMaterial(file.name, content);
      } catch (error) {
        console.error('Error parsing file:', error);
        alert(`解析文件 ${file.name} 失败: ${error.message}`);
      }
    }
    
    await this.loadModuleMaterials();
    await this.updateSidebarStats();
    // 不记录上传时间，只有学习和复习计入学习时间
  },
  
  async parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    switch (ext) {
      case 'pdf':
        return await this.parsePDF(file);
      case 'docx':
        return await this.parseDOCX(file);
      case 'md':
      case 'txt':
        return await this.parseText(file);
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  },
  
  async parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    
    // 大PDF优化：每10页为一组处理，避免内存溢出
    const batchSize = 10;
    for (let i = 1; i <= pdf.numPages; i += batchSize) {
      const endPage = Math.min(i + batchSize - 1, pdf.numPages);
      const pagePromises = [];
      
      for (let pageNum = i; pageNum <= endPage; pageNum++) {
        pagePromises.push(
          pdf.getPage(pageNum).then(page => 
            page.getTextContent().then(content => ({
              pageNum,
              text: content.items.map(item => item.str).join(' ')
            }))
          )
        );
      }
      
      const pageResults = await Promise.all(pagePromises);
      // 按页码排序，确保顺序正确
      pageResults.sort((a, b) => a.pageNum - b.pageNum);
      text += pageResults.map(p => p.text).join('\n') + '\n';
      
      // 每处理完一组，让出主线程
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    console.log(`PDF parsed: ${pdf.numPages} pages, ${text.length} chars`);
    return text;
  },
  
  async parseDOCX(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  },
  
  async parsePPTX(file) {
    const arrayBuffer = await file.arrayBuffer();
    
    try {
      // 使用pptx-parser库解析PPTX
      const parser = new PptxParser();
      const result = await parser.parse(arrayBuffer);
      
      // 提取所有幻灯片的文本
      let allText = '';
      if (result.slides && result.slides.length > 0) {
        result.slides.forEach((slide, index) => {
          allText += `\n--- 幻灯片 ${index + 1} ---\n`;
          if (slide.text) {
            allText += slide.text + '\n';
          }
          // 如果有shape对象也提取文本
          if (slide.shapes && slide.shapes.length > 0) {
            slide.shapes.forEach(shape => {
              if (shape.text) {
                allText += shape.text + '\n';
              }
            });
          }
        });
      }
      
      console.log(`PPTX parsed: ${(result.slides && result.slides.length) || 0} slides`);
      return allText || '[PPTX文件无法提取文本内容]';
    } catch (error) {
      console.error('PPTX parse error:', error);
      // 如果解析失败，尝试使用备用方法
      return await this.parsePPTXFallback(arrayBuffer);
    }
  },
  
  // PPTX备用解析方法（使用zip和XML解析）
  async parsePPTXFallback(arrayBuffer) {
    try {
      // 加载JSZip库
      const JSZip = window.JSZip || await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      let allText = '';
      const slideFiles = [];
      
      // 查找所有幻灯片XML文件
      zip.forEach((path, file) => {
        if (path.match(/^ppt\/slides\/slide\d+\.xml$/)) {
          slideFiles.push({ path, file });
        }
      });
      
      // 按顺序解析每个幻灯片
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.path.match(/slide(\d+)\.xml/)[1]);
        const numB = parseInt(b.path.match(/slide(\d+)\.xml/)[1]);
        return numA - numB;
      });
      
      for (let i = 0; i < slideFiles.length; i++) {
        const { path, file } = slideFiles[i];
        const xmlContent = await file.async('text');
        // 使用DOMParser解析XML并提取文本
        const text = this.extractTextFromPPTXSlide(xmlContent);
        allText += `\n--- 幻灯片 ${i + 1} ---\n${text}\n`;
      }
      
      return allText || '[PPTX备用解析也未能提取内容]';
    } catch (fallbackError) {
      console.error('PPTX fallback parse error:', fallbackError);
      return '[PPTX文件解析失败]';
    }
  },
  
  // 从PPTX幻灯片XML中提取文本
  extractTextFromPPTXSlide(xmlContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');
    
    // 查找所有文本节点
    const textNodes = xmlDoc.getElementsByTagName('a:t');
    let texts = [];
    for (let i = 0; i < textNodes.length; i++) {
      const text = textNodes[i].textContent.trim();
      if (text) texts.push(text);
    }
    
    return texts.join(' ');
  },
  
  async parseText(file) {
    return await file.text();
  },
  
  async saveMaterial(filename, content) {
    const material = {
      id: `${this.currentModule}_${Date.now()}`,
      moduleId: this.currentModule,
      title: filename,
      content: content.substring(0, 50000), // Store more content for AI processing
      sourceFile: filename,
      status: 'pending', // pending, processing, completed
      createdAt: new Date()
    };
    
    await db.materials.put(material);
    
    // 检查是否配置了API
    const settings = await this.getSettings();
    if (!settings.apiKey) {
      console.warn('No API key configured, using simple extraction mode');
    }
    
    // 立即开始AI处理，提取学习条目
    this.processMaterialWithAI(material);
  },
  
  // 使用AI处理材料，提取学习条目（支持大文件分块处理）
  async processMaterialWithAI(material) {
    const settings = await this.getSettings();
    const mod = this.modules[material.moduleId];
    
    await db.materials.update(material.id, { status: 'processing' });
    
    try {
      let allEntries = [];
      const content = material.content;
      
      // 大文件分块处理：每块约3000字符（控制在API限制内）
      const chunkSize = 3000;
      const chunks = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize));
      }
      
      console.log(`Processing ${chunks.length} chunks for ${material.title}, total ${content.length} chars`);
      
      if (settings.apiKey) {
        // 对每个块使用AI处理
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          console.log(`\n===== Processing chunk ${i + 1}/${chunks.length} =====`);
          console.log(`Chunk size: ${chunk.length} chars`);
          
          try {
            const entries = await this.callAIForEntriesChunk(chunk, mod, settings, i + 1, chunks.length);
            console.log(`Chunk ${i + 1} returned ${entries.length} entries`);
            allEntries = allEntries.concat(entries);
          } catch (error) {
            console.error(`Chunk ${i + 1} failed:`, error);
            // 继续处理下一个chunk，不中断整体流程
          }
          
          // 更新进度
          const progress = Math.round(((i + 1) / chunks.length) * 100);
          console.log(`Overall progress: ${progress}% (${allEntries.length} entries so far)`);
          await db.materials.update(material.id, { 
            status: 'processing', 
            progress: progress,
            partialCount: allEntries.length 
          });
          
          // 防止API限流，添加延迟
          if (i < chunks.length - 1) {
            console.log('Waiting 1s before next chunk...');
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        console.log(`\n===== All ${chunks.length} chunks processed, total ${allEntries.length} entries =====`);
      } else {
        allEntries = this.extractSimpleEntries(content);
      }
      
      // 去重（基于original字段）- 安全版
      const seen = new Set();
      allEntries = allEntries.filter(e => {
        // 跳过无效条目
        if (!e || !e.original || typeof e.original !== 'string') {
          console.warn('Skipping invalid entry:', e);
          return false;
        }
        const key = e.original.toLowerCase().trim();
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      // 保存条目
      let savedCount = 0;
      for (const entry of allEntries) {
        try {
          await db.entries.put({
            id: `entry_${material.id}_${Math.random().toString(36).substr(2, 9)}`,
            materialId: material.id,
            moduleId: material.moduleId,
            type: entry.type || 'sentence', // word, phrase, sentence
            original: entry.original,
            translation: entry.translation || '',
            wordType: entry.wordType || '', // 词的类型（Substantiv/Verb/Adjektiv等）
            explanation: entry.explanation || '',
            example: entry.example || '',
            gender: entry.gender || '', // 德语词性 m/f/n/pl
            srsLevel: 0,
            nextReview: new Date(),
            interval: 0,
            createdAt: new Date()
          });
          savedCount++;
        } catch (saveError) {
          console.error('Failed to save entry:', entry, saveError);
        }
      }
      console.log(`Saved ${savedCount} entries to database`);
      
      await db.materials.update(material.id, { 
        status: 'completed', 
        entryCount: savedCount 
      });
      
      await this.loadModuleMaterials();
      
      console.log(`Processing completed: ${savedCount} entries saved from ${allEntries.length} extracted`);
      alert(`已成功提取 ${savedCount} 个学习条目（原文共 ${allEntries.length} 条）！`);
    } catch (error) {
      console.error('AI processing error:', error);
      await db.materials.update(material.id, { status: 'error', errorMsg: error.message });
      alert('处理失败: ' + error.message);
    }
  },
  
  // 调用AI处理单个文本块（支持德语三种类型）
  async callAIForEntriesChunk(chunk, mod, settings, chunkIndex, totalChunks) {
    const isGerman = mod.id === 'german' || mod.language === 'German';
    const isEnglish = mod.id === 'english' || mod.language === 'English';
    const isJapanese = mod.id === 'japanese' || mod.language === 'Japanese';
    const isDefaultModule = isGerman || isEnglish || isJapanese;
    
    // 用户自定义提取要求（非默认模块）
    const customPrompt = !isDefaultModule ? (mod.customPrompt ? `

【用户自定义提取要求】
${mod.customPrompt}

请根据以上要求提取学习条目。` : `

【默认提取要求】
提取常用词汇和实用表达，优先选择日常生活、学习和工作场景中的高频词汇。包括：
- 常用名词（人、事、物、地点等）
- 实用动词和形容词
- 固定搭配和短语
- 实用例句和表达`) : '';
    
    // 针对德语的特殊提示
    const germanPrompt = isGerman ? `特别注意：这是德语学习材料，请积极、尽可能多地提取学习条目，严格按照以下三类分类：

1. 【单词 word】：所有名词、动词、形容词、副词、介词、连词等
   - 必须标注性别：m.阳性 / f.阴性 / n.中性 / pl.复数（若可确定）
   - 包含：原文、中文翻译、用法解释、例句
   - 目标：每1000字符至少提取15-25个单词

2. 【短语 phrase】：所有固定搭配、介词短语、常用表达、习语
   - 不需要标注性别
   - 包含：原文、中文翻译、用法解释、例句
   - 目标：每1000字符至少提取5-10个短语

3. 【语句 sentence】：完整句子、对话、重要句型、常用表达
   - 只需要：原文、中文翻译
   - 不需要解释和例句
   - 目标：每1000字符至少提取3-5个语句

重要提示：
- 不要过滤“简单”或“复杂”的词汇，只要是有学习价值的词都要提取
- 例句可以由AI生成，不一定要来源于原文，但必须符合词义和用法` : '';
    
    // 针对英语的特殊提示
    const englishPrompt = isEnglish ? `特别注意：这是英语学习材料，请积极、尽可能多地提取学习条目，严格按照以下三类分类：

1. 【单词 word】：所有名词、动词、形容词、副词、介词、连词等
   - 需要标注词性：Noun/名词、Verb/动词、Adjective/形容词、Adverb/副词、Preposition/介词等
   - 英语不需要性别标记（无der/die/das）
   - 包含：原文、中文翻译、用法解释、例句
   - 目标：每1000字符至少提取15-25个单词

2. 【短语 phrase】：所有固定搭配、介词短语、常用表达、习语
   - 不需要标注词性
   - 包含：原文、中文翻译、用法解释、例句
   - 目标：每1000字符至少提取5-10个短语

3. 【语句 sentence】：完整句子、对话、重要句型、常用表达
   - 只需要：原文、中文翻译
   - 不需要解释和例句
   - 目标：每1000字符至少提取3-5个语句

重要提示：
- 不要过滤"简单"或"复杂"的词汇，只要是有学习价值的词都要提取
- 例句可以由AI生成，不一定要来源于原文，但必须符合词义和用法` : '';
    
    // 针对日语的特殊提示
    const japanesePrompt = isJapanese ? `特别注意：这是日语学习材料，请严格按照以下规则提取：

【注音规则 - 统一规范】

1. 【单词 word】格式：汉字(读音)
   - 汉字单词：整体标注在最后，如"安定(あんてい)" ❌禁止逐字注音
   - 片假名外来语：标注外来语原文，如"コンピュータ(computer)"
   - 纯平假名单词：保持原样
   - 词性详细标注：他动词·五段/一段、自动词·五段/一段、名词、形容动词、形容词等
   
2. 【短语 phrase】格式：汉字短语(读音)
   - 含汉字的短语：整体注音在最后的括号中，如"入場者数(にゅうじょうしゃすう)"
   - ❌禁止逐字注音：不要"入(にゅう)場(じょう)者(しゃ)数(すう)"
   - 复合词不拆开，整体注音
   
3. 【语句 sentence】格式：纯原文（无注音）
   - 语句original字段不注音，保持完整原文
   - 例如："半年後、自分なりに理解した内容が、会社にとって間違っていないかをチェックしてください。"
   - ❌禁止注音：不要"半(はん)年(とし)後(ご)..."
   - 只需要：原文、中文翻译
   - explanation和example可为空

4. 【例句 example字段】格式：纯原文（无注音）
   - 所有例句都不注音，保持完整原文
   - ❌禁止：不要"入場者数が増(ふ)えています。"
   - ✅正确："入場者数が増えています。"

注意区别（根据类型）：
- 单词word："安定(あんてい)" → 整体注音在括号内
- 短语phrase："入場者数(にゅうじょうしゃすう)" → 整体注音在最后括号内
- 语句sentence："半年後、自分なりに理解した..." → 不注音
- 例句example："物価が安定しています。" → 不注音

格式示例：
- 单词：{"type": "word", "original": "安定(あんてい)", "translation": "稳定", "wordType": "形容动词", "explanation": "没有变化，保持平衡", "example": "物価が安定しています。物价稳定。"}
- 短语：{"type": "phrase", "original": "入場者数(にゅうじょうしゃすう)", "translation": "入场人数", "explanation": "进入某个场所的人数统计", "example": "入場者数が増えています。入场人数在增加。"}
- 语句：{"type": "sentence", "original": "半年後、自分なりに理解した内容が、会社にとって間違っていないかをチェックしてください。", "translation": "半年后，请确认你自己理解的内容对公司来说是否没有错误。"}` : '';
    
    // 语言过滤说明 - 确保只提取目标语言
    const languageFilter = isGerman 
      ? `语言过滤：只提取德语内容，忽略所有中文文本。如果材料是中德混合的，只提取德语词汇和句子，不要提取中文内容。`
      : isEnglish 
      ? `语言过滤：只提取英语内容，忽略所有中文文本。如果材料是中英混合的，只提取英语词汇和句子，不要提取中文内容。`
      : isJapanese
      ? `语言过滤：只提取日语内容（包括汉字、平假名、片假名），忽略所有中文文本。`
      : `语言过滤：只提取${mod.language}内容，忽略中文文本。`;
    
    // 非默认模块直接使用用户定义的Prompt
    const customModulePrompt = !isDefaultModule && mod.customPrompt ? `

${mod.customPrompt}

【基础约束】
- 返回格式：合法JSON数组
- 必填字段：type(word/phrase/sentence)、original、translation、wordType
- explanation支持Markdown格式` : '';
    
    const prompt = `从以下${mod.name}教材内容中积极提取学习条目。这是第 ${chunkIndex}/${totalChunks} 部分。

${germanPrompt}${englishPrompt}${japanesePrompt}${customModulePrompt}

核心要求：
1. ${languageFilter}
2. 积极提取：不要过滤任何外语词汇，只要是有学习价值的都要提取
3. 提取数量目标：每1000字符提取20-40个条目（单词+短语+语句）
4. 例句生成：单词和短语的例句可以由AI根据词义和用法生成，不一定来源于原文
5. 严格按照JSON格式返回
${!isDefaultModule ? '6. explanation字段必须充分使用Markdown格式，包含：词源分类、语法特征、使用场景（必填）、活用变化、近义词辨析等信息' : ''}

教材内容（第${chunkIndex}部分）：
${chunk.substring(0, 5000)}

请返回JSON格式，每个条目包含以下字段：
- type: 条目类型 ("word" | "phrase" | "sentence")
- original: 原文（${mod.language}文本，不含中文）${isJapanese ? '，【日语规范】word/短语整体注音"汉字(读音)"；sentence不注音' : ''}
- translation: 中文翻译
- wordType: 词的类型（仅word类型需要）
- gender: 性别标记（德语：m./f./n./pl.；其他语言留空）
- explanation: 用法解释（word和phrase需要，sentence可为空）
- example: 例句（word和phrase需要，sentence可为空，可由AI生成）${isJapanese ? '，日语例句不注音' : ''}

示例输出：
[${isGerman ? `{
  \"type\": \"word\",
  \"original\": \"Abend\",
  \"translation\": \"晚上\",
  \"wordType\": \"Substantiv\",
  \"gender\": \"m.\",
  \"explanation\": \"表示一天中的晚间时段\",
  \"example\": \"Am Abend lese ich ein Buch. 晚上我读书。\"
}, {
  \"type\": \"phrase\",
  \"original\": \"am Abend\",
  \"translation\": \"在晚上\",
  \"wordType\": \"\",
  \"gender\": \"\",
  \"explanation\": \"表示时间的介词短语\",
  \"example\": \"Ich gehe am Abend ins Kino. 我晚上去看电影。\"
}` : isJapanese ? `{
  \"type\": \"word\",
  \"original\": \"学生(がくせい)\",
  \"translation\": \"学生\",
  \"wordType\": \"名词\",
  \"gender\": \"\",
  \"explanation\": \"在学校学习的人\",
  \"example\": \"私は学生です。我是学生。\"
}, {
  \"type\": \"word\",
  \"original\": \"コンピュータ(computer)\",
  \"translation\": \"计算机\",
  \"wordType\": \"名词\",
  \"gender\": \"\",
  \"explanation\": \"电子计算机，电脑\",
  \"example\": \"コンピュータを使います。使用电脑。\"
}, {
  \"type\": \"word\",
  \"original\": \"ありがとう\",
  \"translation\": \"谢谢\",
  \"wordType\": \"感叹词\",
  \"gender\": \"\",
  \"explanation\": \"表示感谢的礼貌用语\",
  \"example\": \"ありがとうございます。非常感谢。\"
}, {
  \"type\": \"phrase\",
  \"original\": \"1兆円超(いっちょうえんこえ)\"
  \"translation\": \"超过1万亿日元\",
  \"wordType\": \"\",
  \"gender\": \"\",
  \"explanation\": \"超过1万亿日元的金额\",
  \"example\": \"1兆円超の損失が出ました。出现了超过1万亿日元的损失。\"
}, {
  \"type\": \"sentence\",
  \"original\": \"創業者の永守重信氏や現社長の岸田光哉氏も調査対象で、会社側はその結果を待って対応を決めるとしている。\",
  \"translation\": \"创始人永守重信先生和现任社长岸田光哉先生也是调查对象，公司方面表示将等待调查结果后再决定应对措施。\",
  \"wordType\": \"\",
  \"gender\": \"\",
  \"explanation\": \"\",
  \"example\": \"\"
}` : `{
  \"type\": \"word\",
  \"original\": \"evening\",
  \"translation\": \"晚上\",
  \"wordType\": \"Noun\",
  \"gender\": \"\",
  \"explanation\": \"表示一天中从下午到夜间的时段\",
  \"example\": \"I like to read books in the evening. 我喜欢在晚上读书。\"
}, {
  \"type\": \"phrase\",
  \"original\": \"in the evening\",
  \"translation\": \"在晚上\",
  \"wordType\": \"\",
  \"gender\": \"\",
  \"explanation\": \"表示时间的介词短语\",
  \"example\": \"I usually go for a walk in the evening. 我通常在晚上散步。\"
}`}]

请返回完整的JSON数组：`;

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: `你是一位专业的${mod.name}教学专家，擅长从教材中系统性地提取学习要点。请返回有效的JSON数组。` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: settings.maxTokens || 8000
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      let errorMessage = 'Unknown error';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = (errorData.error && errorData.error.message) || errorData.message || errorText;
      } catch (e) {
        errorMessage = errorText || `HTTP ${response.status}`;
      }
      throw new Error(`API error: ${response.status} - ${errorMessage}`);
    }
    
    const data = await response.json();
    console.log(`Chunk ${chunkIndex}: API response received:`, JSON.stringify(data, null, 2));
    
    // 检查响应格式 - 支持多种API格式
    let content_text = '';
    
    if (data.choices && data.choices[0]) {
      const choice = data.choices[0];
      // OpenAI / GLM 标准格式
      if (choice.message && choice.message.content) {
        content_text = choice.message.content;
      }

      // 某些API可能使用的其他字段
      else if (choice.text) {
        content_text = choice.text;
      }
      else if (choice.content) {
        content_text = choice.content;
      }
    }
    // 某些API可能直接返回content
    else if (data.content) {
      content_text = data.content;
    }
    // 某些API可能返回delta流式输出
    else if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
      content_text = data.choices[0].delta.content;
    }
    
    console.log(`Chunk ${chunkIndex}: Extracted content length:`, content_text ? content_text.length : 0);
    console.log(`Chunk ${chunkIndex}: Content preview:`, content_text ? content_text.substring(0, 300) : 'EMPTY');
    
    // 检查finish_reason
    if (data.choices && data.choices[0] && data.choices[0].finish_reason) {
      console.log(`Chunk ${chunkIndex}: Finish reason:`, data.choices[0].finish_reason);
    }
    
    if (!content_text || content_text.trim().length === 0) {
      console.warn(`Chunk ${chunkIndex}: Empty content received from API`);
      // 试着调整参数重试一次
      console.log(`Chunk ${chunkIndex}: Retrying with adjusted parameters...`);
      return await this.retryAIChunk(chunk, mod, settings, chunkIndex, totalChunks);
    }
    
    // 提取JSON - 先去除Markdown代码块标记
    let cleaned_text = content_text;
    
    // 移除 ```json 和 ``` 标记
    cleaned_text = cleaned_text.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
    cleaned_text = cleaned_text.replace(/```\s*/g, '');
    cleaned_text = cleaned_text.trim();
    
    console.log(`Chunk ${chunkIndex}: Cleaned text length:`, cleaned_text.length);
    console.log(`Chunk ${chunkIndex}: Cleaned text preview:`, cleaned_text.substring(0, 300));
    
    // 方法1: 尝试完整JSON解析
    try {
      const arrayStart = cleaned_text.indexOf('[');
      let bracketCount = 0;
      let inString = false;
      let escapeNext = false;
      let arrayEnd = -1;
      
      // 逐字符计算括号（忽略字符串内的括号）
      for (let i = arrayStart; i < cleaned_text.length; i++) {
        const char = cleaned_text[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !inString) {
          inString = true;
        } else if (char === '"' && inString) {
          inString = false;
        } else if (!inString) {
          if (char === '[') bracketCount++;
          else if (char === ']') {
            bracketCount--;
            if (bracketCount === 0 && arrayStart !== -1) {
              arrayEnd = i;
              break;
            }
          }
        }
      }
      
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        const jsonStr = cleaned_text.substring(arrayStart, arrayEnd + 1);
        console.log(`Chunk ${chunkIndex}: Found matching brackets at ${arrayStart}-${arrayEnd}`);
        
        const entries = JSON.parse(jsonStr);
        console.log(`Chunk ${chunkIndex}: extracted ${entries.length} entries`);
        
        // 验证条目格式
        const validEntries = entries.filter(e => {
          if (!e || typeof e !== 'object') return false;
          if (!e.original || typeof e.original !== 'string') return false;
          return true;
        });
        
        console.log(`Chunk ${chunkIndex}: returning ${validEntries.length} valid entries`);
        return validEntries;
      }
    } catch (e) {
      console.log(`Chunk ${chunkIndex}: Full JSON parse failed, trying fallback...`);
    }
    
    // 方法2: 逐个对象提取（对于不完整JSON）
    try {
      const entries = [];
      // 匹配完整的JSON对象
      const objectRegex = /\{[\s\S]*?"original"[\s\S]*?\}/g;
      let match;
      
      while ((match = objectRegex.exec(cleaned_text)) !== null) {
        try {
          const objStr = match[0];
          // 确保花括号匹配
          const obj = JSON.parse(objStr);
          if (obj && obj.original && typeof obj.original === 'string') {
            entries.push(obj);
          }
        } catch (e) {
          // 忽略无法解析的对象
        }
      }
      
      if (entries.length > 0) {
        console.log(`Chunk ${chunkIndex}: Extracted ${entries.length} entries via regex`);
        return entries;
      }
    } catch (e) {
      console.error(`Chunk ${chunkIndex}: Regex extraction also failed:`, e);
    }
    
    console.warn(`Chunk ${chunkIndex}: No valid entries extracted`);
    return [];
  },
  
  // 重试AI请求（使用简化参数）
  async retryAIChunk(chunk, mod, settings, chunkIndex, totalChunks) {
    try {
      console.log(`Chunk ${chunkIndex}: Retrying with simplified prompt...`);
      
      const simplePrompt = `从以下德语教材中提取学习条目。

教材内容：
${chunk.substring(0, 8000)}

请返回JSON数组，每个条目包含：
- type: "word"/"phrase"/"sentence"
- original: 德语原文
- translation: 中文翻译
- wordType: 词的类型（仅word需要）
- gender: 性别（仅word需要）
- explanation: 用法解释
- example: 例句

请尽量多地提取，返回完整JSON数组：`;

      const response = await fetch(`${settings.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: '你是德语教学专家。请返回有效的JSON数组。' },
            { role: 'user', content: simplePrompt }
          ],
          temperature: 0.5,
          max_tokens: settings.maxTokens || 16000
        })
      });
      
      if (!response.ok) {
        console.error(`Chunk ${chunkIndex}: Retry failed with status`, response.status);
        return [];
      }
      
      const data = await response.json();
      
      // 提取内容
      let content_text = '';
      if (data.choices && data.choices[0] && data.choices[0].message) {
        content_text = data.choices[0].message.content || '';
      }
      
      console.log(`Chunk ${chunkIndex}: Retry response length:`, content_text.length);
      
      if (!content_text || content_text.trim().length === 0) {
        return [];
      }
      
      // 尝试解析JSON
      const jsonMatch = content_text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const entries = JSON.parse(jsonMatch[0]);
        console.log(`Chunk ${chunkIndex}: Retry extracted ${entries.length} entries`);
        return entries.filter(e => e && e.original);
      }
      
      return [];
    } catch (error) {
      console.error(`Chunk ${chunkIndex}: Retry error:`, error);
      return [];
    }
  },
  
  // 简单条目提取（无API时使用）- 增强版
  extractSimpleEntries(content) {
    // 首先尝试解析德语词汇表格式
    const vocabularyEntries = this.parseGermanVocabularyList(content);
    if (vocabularyEntries.length > 0) {
      return vocabularyEntries;
    }
    
    const entries = [];
    
    // 策略1：提取段落（适合长文本）
    // 按空行分割段落，过滤掉太短的
    const paragraphs = content
      .split(/\n\s*\n/)  // 按空行分割
      .map(p => p.trim())
      .filter(p => p.length > 50 && p.length < 2000);  // 保留50-2000字符的段落
    
    for (const para of paragraphs.slice(0, 15)) {
      entries.push({
        type: 'sentence',
        original: para.substring(0, 500),  // 限制最大500字符
        translation: '[请使用AI功能获取翻译]',
        explanation: '',
        example: ''
      });
    }
    
    // 策略2：提取长句子（如果段落不够）
    if (entries.length < 10) {
      const sentences = content
        .replace(/([.!?]\s+)/g, "$1|")
        .split("|")
        .map(s => s.trim())
        .filter(s => s.length > 30 && s.length < 300);
      
      for (const sent of sentences.slice(0, 20 - entries.length)) {
        entries.push({
          type: 'sentence',
          original: sent,
          translation: '[请使用AI功能获取翻译]',
          explanation: '',
          example: ''
        });
      }
    }
    
    // 策略3：提取重要词汇
    const importantWords = this.extractImportantWords(content);
    entries.push(...importantWords.slice(0, 30));
    
    return entries;
  },
  
  // 提取重要词汇（无API时使用）
  extractImportantWords(content) {
    const entries = [];
    
    // 常见学习关键词模式
    const patterns = [
      // 名词模式: der/die/das + 词
      { regex: /\b(der|die|das)\s+([A-Z][a-zäöüß]+)/g, type: 'word', gender: '$1', wordType: 'Substantiv' },
      // 带冠词的名词: im Kino, zur Schule
      { regex: /\b(im|zur|zum|bei|von)\s+([a-zäöüß]+)/gi, type: 'phrase', wordType: '' },
      // 常用动词不定式: zu machen, zu gehen
      { regex: /\bzu\s+([a-zäöüß]+en)\b/g, type: 'word', wordType: 'Verb' },
      // 带介词的短语: in der Stadt, auf dem Tisch
      { regex: /\b(in|auf|an|mit|von|zu|für|durch|\u00fcber|unter|vor|nach)\s+(der|die|das|dem|den|einem|einer)\s+([a-zäöüß]+)/gi, type: 'phrase', wordType: '' }
    ];
    
    const seen = new Set();
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const original = match[0];
        if (seen.has(original.toLowerCase())) continue;
        seen.add(original.toLowerCase());
        
        entries.push({
          type: pattern.type,
          original: original,
          translation: '[请使用AI功能获取翻译]',
          wordType: pattern.wordType || '',
          gender: pattern.gender ? pattern.gender.replace('$1', match[1]) : '',
          explanation: '',
          example: ''
        });
      }
    }
    
    return entries;
  },
  
  // 解析德语词汇表格式（如A1/A2词汇表）
  parseGermanVocabularyList(content) {
    const entries = [];
    const lines = content.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;
      
      // 跳过明显不是词条的行
      if (trimmed.startsWith('Seite') || trimmed.startsWith('Kapitel') || 
          trimmed.startsWith('©') || trimmed.match(/^\d+$/)) {
        continue;
      }
      
      // 匹配模式：单词, 词性 – 单词类型
      // 如：Abend, der – Substantiv
      // 如：abfahren – Verb
      // 如：acht – Kardinalzahl
      // 如：an – Präposition
      // 支持短横线 - 或长横线 –
      
      const patterns = [
        // 带词性的名词: Abend, der – Substantiv
        /^([\w\s\-\/äöüßÄÖÜ\.]+),\s*(der|die|das|pl\.?)\s*[-–—]\s*(Substantiv|Nomen)/i,
        // 复数名词: Eltern (pl.) – Substantiv
        /^([\w\s\-\/äöüßÄÖÜ\.]+)\s*\(\s*pl\.?\s*\)\s*[-–—]\s*(Substantiv|Nomen)/i,
        // 动词: abfahren – Verb
        /^([\w\s\-\/äöüßÄÖÜ\.]+)\s*[-–—]\s*(Verb|V\.|regelmäßiges Verb|unregelmäßiges Verb)/i,
        // 形容词: alt – Adjektiv
        /^([\w\s\-\/äöüßÄÖÜ\.]+)\s*[-–—]\s*(Adjektiv|A\.|Partizip)/i,
        // 其他词类: aber – Konjunktion
        /^([\w\s\-\/äöüßÄÖÜ\.]+)\s*[-–—]\s*(Präposition|Konjunktion|Adverb|Pronomen|Indefinitpronomen|Kardinalzahl|Ordinalzahl|Interjektion|Artikel|Numerale)/i
      ];
      
      let matched = false;
      for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = trimmed.match(pattern);
        if (match) {
          let original = match[1].trim();
          let genderRaw = '';
          let wordType = '';
          
          // 根据模式索引确定匹配组
          if (i === 0 || i === 1) {
            // 名词模式: match[2]=词性(der/die/das), match[3]=词类(Substantiv)
            genderRaw = match[2] ? match[2].toLowerCase() : '';
            wordType = match[3];
          } else {
            // 其他模式: match[2]=词类(Verb/Adjektiv等)
            wordType = match[2];
          }
          
          // 处理性别标记
          let gender = '';
          if (genderRaw === 'der') gender = 'm.';
          else if (genderRaw === 'die') gender = 'f.';
          else if (genderRaw === 'das') gender = 'n.';
          else if (genderRaw === 'pl' || genderRaw === 'pl.') gender = 'pl.';
          
          // 如果是复数形式
          if (original.includes('(pl') || original.includes('(Pl')) {
            gender = 'pl.';
            original = original.replace(/\s*\(\s*pl\.?\s*\)/i, '');
          }
          
          entries.push({
            type: 'word',
            original: original,
            translation: '',
            explanation: `词类：${this.translateWordType(wordType)}`,
            example: '',
            gender: gender,
            wordType: wordType,
            srsLevel: 0,
            nextReview: Date.now(),
            interval: 0,
            easeFactor: 2.5
          });
          matched = true;
          break;
        }
      }
    }
    
    return entries;
  },
  
  translateWordType(type) {
    const translations = {
      'Substantiv': '名词',
      'Nomen': '名词',
      'Verb': '动词',
      'V.': '动词',
      'regelmäßiges Verb': '规则动词',
      'unregelmäßiges Verb': '不规则动词',
      'Adjektiv': '形容词',
      'A.': '形容词',
      'Partizip': '分词',
      'Adverb': '副词',
      'Präposition': '介词',
      'Konjunktion': '连词',
      'Pronomen': '代词',
      'Indefinitpronomen': '不定代词',
      'Kardinalzahl': '基数词',
      'Ordinalzahl': '序数词',
      'Interjektion': '感叹词',
      'Artikel': '冠词',
      'Numerale': '数词'
    };
    return translations[type] || type;
  },
  
  // 从localStorage加载已抓取的ZDF文章历史
  loadZDFHistory() {
    try {
      const history = localStorage.getItem('zdf_fetched_history');
      if (history) {
        this.fetchedZDFFeeds = JSON.parse(history);
        console.log(`Loaded ${this.fetchedZDFFeeds.length} ZDF articles from history`);
      }
    } catch (e) {
      console.error('Failed to load ZDF history:', e);
      this.fetchedZDFFeeds = [];
    }
  },
  
  // 保存ZDF抓取历史到localStorage
  saveZDFHistory() {
    try {
      localStorage.setItem('zdf_fetched_history', JSON.stringify(this.fetchedZDFFeeds));
    } catch (e) {
      console.error('Failed to save ZDF history:', e);
    }
  },
  
  // 清空ZDF抓取历史
  clearZDFHistory() {
    if (confirm('确定要清空已抓取的文章记录吗？清空后可以重新抓取之前的文章。')) {
      this.fetchedZDFFeeds = [];
      localStorage.removeItem('zdf_fetched_history');
      alert('已清空抓取记录');
    }
  },
  
  // ==================== BBC News 功能 ====================
  
  // 加载 BBC 抓取历史
  loadBBCHistory() {
    try {
      const history = localStorage.getItem('bbc_fetched_history');
      if (history) {
        this.fetchedBBCFeeds = JSON.parse(history);
        console.log(`Loaded ${this.fetchedBBCFeeds.length} BBC articles from history`);
      }
    } catch (e) {
      console.error('Error loading BBC history:', e);
      this.fetchedBBCFeeds = [];
    }
  },
  
  // 保存 BBC 抓取历史
  saveBBCHistory() {
    try {
      localStorage.setItem('bbc_fetched_history', JSON.stringify(this.fetchedBBCFeeds));
    } catch (e) {
      console.error('Error saving BBC history:', e);
    }
  },
  
  // 清空 BBC 抓取历史
  clearBBCHistory() {
    this.fetchedBBCFeeds = [];
    localStorage.removeItem('bbc_fetched_history');
    alert('BBC 抓取记录已清空');
  },
  
  // 获取 BBC 新闻
  async fetchBBCNews() {
    if (this.fetchedBBCFeeds.length === 0) {
      this.loadBBCHistory();
    }
    
    const btn = document.getElementById('bbc-fetch-btn');
    const progress = document.getElementById('bbc-progress');
    const status = document.getElementById('bbc-status');
    const preview = document.getElementById('bbc-preview');
    const contentDiv = document.getElementById('bbc-content');
    
    if (btn) btn.disabled = true;
    if (progress) progress.classList.remove('hidden');
    if (preview) preview.classList.add('hidden');
    if (status) status.textContent = '正在获取 BBC 新闻...';
    
    try {
      const settings = await this.getSettings();
      const PROXY_BASE_URL = settings.proxyUrl;
      const apiUrl = `${PROXY_BASE_URL}/api/bbc/rss?category=${this.bbcCategory}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch RSS');
      
      const rssText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rssText, 'text/xml');
      
      const items = xmlDoc.querySelectorAll('item');
      const articles = [];
      
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        
        if (link && !this.fetchedBBCFeeds.includes(link)) {
          articles.push({ title, link, description, pubDate });
        }
      });
      
      // 按发布日期排序（处理无效日期）
      articles.sort((a, b) => {
        const dateA = new Date(a.pubDate);
        const dateB = new Date(b.pubDate);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      });
      
      if (articles.length === 0) {
        if (this.fetchedBBCFeeds.length > 50) {
          this.fetchedBBCFeeds = this.fetchedBBCFeeds.slice(-50);
          this.saveBBCHistory();
        }
        
        if (confirm('本栏目所有最新文章都已抓取过。是否清空记录重新抓取？')) {
          this.fetchedBBCFeeds = [];
          return this.fetchBBCNews();
        }
        
        if (status) status.textContent = '暂无新文章';
        if (btn) btn.disabled = false;
        return;
      }
      
      // 选择最新的一篇文章
      const selectedArticle = articles[0];
      this.fetchedBBCFeeds.push(selectedArticle.link);
      this.saveBBCHistory();
      
      if (status) status.textContent = '正在获取文章内容...';
      
      const articleProxy = `${settings.proxyUrl}/api/bbc/article?url=${encodeURIComponent(selectedArticle.link)}`;
      const articleRes = await fetch(articleProxy);
      const articleData = await articleRes.json();
      
      if (articleData.content) {
        // 解析日期，处理无效日期情况
        let dateStr = selectedArticle.pubDate;
        const pubDate = new Date(selectedArticle.pubDate);
        if (!isNaN(pubDate)) {
          dateStr = pubDate.toLocaleDateString('zh-CN');
        }
        
        this.bbcCurrentArticle = {
          title: articleData.title || selectedArticle.title,
          content: articleData.content,
          description: selectedArticle.description,
          link: selectedArticle.link,
          pubDate: dateStr,
          source: 'BBC News'
        };
        
        if (contentDiv) {
          contentDiv.innerHTML = `
            <h5 class="font-bold mb-2">${this.bbcCurrentArticle.title}</h5>
            <p class="text-xs text-amber-600 mb-2">📅 发布日期：${dateStr}</p>
            <p class="text-xs text-gray-500 mb-2">${this.bbcCurrentArticle.content.substring(0, 300)}...</p>
          `;
        }
        if (preview) preview.classList.remove('hidden');
        if (status) status.textContent = '文章获取成功！';
      } else {
        throw new Error('No content extracted');
      }
      
    } catch (error) {
      console.error('BBC fetch error:', error);
      if (status) status.textContent = '获取失败: ' + error.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  },
  
  // 处理 BBC 内容（AI提取）
  async processBBCContent() {
    if (!this.bbcCurrentArticle) {
      alert('请先获取新闻文章');
      return;
    }
    
    const progress = document.getElementById('bbc-progress');
    const status = document.getElementById('bbc-status');
    
    if (status) status.textContent = '正在使用AI提取学习条目...';
    
    try {
      const material = {
        id: `bbc_${Date.now()}`,
        moduleId: this.currentModule,
        title: `BBC: ${this.bbcCurrentArticle.title.substring(0, 50)}...`,
        content: this.bbcCurrentArticle.content,
        sourceFile: this.bbcCurrentArticle.link,
        source: this.bbcCurrentArticle.source,
        createdAt: new Date()
      };
      
      await db.materials.put(material);
      await this.processMaterialWithAI(material);
      
      const preview = document.getElementById('bbc-preview');
      if (preview) preview.classList.add('hidden');
      if (progress) progress.classList.add('hidden');
      this.bbcCurrentArticle = null;
      await this.loadModuleMaterials();
      
      alert('成功从 BBC 新闻中提取学习条目！');
      
    } catch (error) {
      console.error('BBC processing error:', error);
      if (status) status.textContent = '处理失败: ' + error.message;
      if (progress) progress.classList.add('hidden');
    }
  },
  
  // ==================== The Guardian 功能 ====================
  
  // 加载 The Guardian 抓取历史
  loadGuardianHistory() {
    try {
      const history = localStorage.getItem('guardian_fetched_history');
      if (history) {
        this.fetchedGuardianFeeds = JSON.parse(history);
        console.log(`Loaded ${this.fetchedGuardianFeeds.length} The Guardian articles from history`);
      }
    } catch (e) {
      console.error('Error loading The Guardian history:', e);
      this.fetchedGuardianFeeds = [];
    }
  },
  
  // 保存 The Guardian 抓取历史
  saveGuardianHistory() {
    try {
      localStorage.setItem('guardian_fetched_history', JSON.stringify(this.fetchedGuardianFeeds));
    } catch (e) {
      console.error('Error saving The Guardian history:', e);
    }
  },
  
  // 清空 The Guardian 抓取历史
  clearGuardianHistory() {
    this.fetchedGuardianFeeds = [];
    localStorage.removeItem('guardian_fetched_history');
    alert('The Guardian 抓取记录已清空');
  },
  
  // 获取 The Guardian 新闻
  async fetchGuardianNews() {
    if (this.fetchedGuardianFeeds.length === 0) {
      this.loadGuardianHistory();
    }
    
    const btn = document.getElementById('guardian-fetch-btn');
    const progress = document.getElementById('guardian-progress');
    const status = document.getElementById('guardian-status');
    const preview = document.getElementById('guardian-preview');
    const contentDiv = document.getElementById('guardian-content');
    
    if (btn) btn.disabled = true;
    if (progress) progress.classList.remove('hidden');
    if (preview) preview.classList.add('hidden');
    if (status) status.textContent = '正在获取 The Guardian 新闻...';
    
    try {
      const settings = await this.getSettings();
      const PROXY_BASE_URL = settings.proxyUrl;
      const apiUrl = `${PROXY_BASE_URL}/api/guardian/rss?category=${this.guardianCategory}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch RSS');
      
      const rssText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rssText, 'text/xml');
      
      const items = xmlDoc.querySelectorAll('item');
      const articles = [];
      
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        
        if (link && !this.fetchedGuardianFeeds.includes(link)) {
          articles.push({ title, link, description, pubDate });
        }
      });
      
      // 按发布日期排序
      articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      
      if (articles.length === 0) {
        if (this.fetchedGuardianFeeds.length > 50) {
          this.fetchedGuardianFeeds = this.fetchedGuardianFeeds.slice(-50);
          this.saveGuardianHistory();
        }
        
        if (confirm('本栏目所有最新文章都已抓取过。是否清空记录重新抓取？')) {
          this.fetchedGuardianFeeds = [];
          return this.fetchGuardianNews();
        }
        
        if (status) status.textContent = '暂无新文章';
        if (btn) btn.disabled = false;
        return;
      }
      
      // 选择最新的一篇文章
      const selectedArticle = articles[0];
      this.fetchedGuardianFeeds.push(selectedArticle.link);
      this.saveGuardianHistory();
      
      if (status) status.textContent = '正在获取文章内容...';
      
      const articleProxy = `${settings.proxyUrl}/api/guardian/article?url=${encodeURIComponent(selectedArticle.link)}`;
      const articleRes = await fetch(articleProxy);
      const articleData = await articleRes.json();
      
      if (articleData.content) {
        const pubDate = new Date(selectedArticle.pubDate);
        const dateStr = pubDate.toLocaleDateString('zh-CN');
        
        this.guardianCurrentArticle = {
          title: articleData.title || selectedArticle.title,
          content: articleData.content,
          description: selectedArticle.description,
          link: selectedArticle.link,
          pubDate: dateStr,
          source: 'The Guardian'
        };
        
        if (contentDiv) {
          contentDiv.innerHTML = `
            <h5 class="font-bold mb-2">${this.guardianCurrentArticle.title}</h5>
            <p class="text-xs text-amber-600 mb-2">📅 发布日期：${dateStr}</p>
            <p class="text-xs text-gray-500 mb-2">${this.guardianCurrentArticle.content.substring(0, 300)}...</p>
          `;
        }
        if (preview) preview.classList.remove('hidden');
        if (status) status.textContent = '文章获取成功！';
      } else {
        throw new Error('No content extracted');
      }
      
    } catch (error) {
      console.error('The Guardian fetch error:', error);
      if (status) status.textContent = '获取失败: ' + error.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  },
  
  // 处理 The Guardian 内容（AI提取）
  async processGuardianContent() {
    if (!this.guardianCurrentArticle) {
      alert('请先获取新闻文章');
      return;
    }
    
    const progress = document.getElementById('guardian-progress');
    const status = document.getElementById('guardian-status');
    
    if (status) status.textContent = '正在使用AI提取学习条目...';
    
    try {
      const material = {
        id: `guardian_${Date.now()}`,
        moduleId: this.currentModule,
        title: `The Guardian: ${this.guardianCurrentArticle.title.substring(0, 50)}...`,
        content: this.guardianCurrentArticle.content,
        sourceFile: this.guardianCurrentArticle.link,
        source: this.guardianCurrentArticle.source,
        createdAt: new Date()
      };
      
      await db.materials.put(material);
      await this.processMaterialWithAI(material);
      
      const preview = document.getElementById('guardian-preview');
      if (preview) preview.classList.add('hidden');
      if (progress) progress.classList.add('hidden');
      this.guardianCurrentArticle = null;
      await this.loadModuleMaterials();
      
      alert('成功从 The Guardian 新闻中提取学习条目！');
      
    } catch (error) {
      console.error('The Guardian processing error:', error);
      if (status) status.textContent = '处理失败: ' + error.message;
      if (progress) progress.classList.add('hidden');
    }
  },
  
  // ==================== NPR News 功能 ====================
  
  // 加载 NPR 抓取历史
  loadNPRHistory() {
    try {
      const history = localStorage.getItem('npr_fetched_history');
      if (history) {
        this.fetchedNPRFeeds = JSON.parse(history);
        console.log(`Loaded ${this.fetchedNPRFeeds.length} NPR articles from history`);
      }
    } catch (e) {
      console.error('Error loading NPR history:', e);
      this.fetchedNPRFeeds = [];
    }
  },
  
  // 保存 NPR 抓取历史
  saveNPRHistory() {
    try {
      localStorage.setItem('npr_fetched_history', JSON.stringify(this.fetchedNPRFeeds));
    } catch (e) {
      console.error('Error saving NPR history:', e);
    }
  },
  
  // 清空 NPR 抓取历史
  clearNPRHistory() {
    this.fetchedNPRFeeds = [];
    localStorage.removeItem('npr_fetched_history');
    alert('NPR 抓取记录已清空');
  },
  
  // 获取 NPR 新闻
  async fetchNPRNews() {
    if (this.fetchedNPRFeeds.length === 0) {
      this.loadNPRHistory();
    }
    
    const btn = document.getElementById('npr-fetch-btn');
    const progress = document.getElementById('npr-progress');
    const status = document.getElementById('npr-status');
    const preview = document.getElementById('npr-preview');
    const contentDiv = document.getElementById('npr-content');
    
    if (btn) btn.disabled = true;
    if (progress) progress.classList.remove('hidden');
    if (preview) preview.classList.add('hidden');
    if (status) status.textContent = '正在获取 NPR 新闻...';
    
    try {
      const settings = await this.getSettings();
      const PROXY_BASE_URL = settings.proxyUrl;
      const apiUrl = `${PROXY_BASE_URL}/api/npr/rss?category=${this.nprCategory}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch RSS');
      
      const rssText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rssText, 'text/xml');
      
      const items = xmlDoc.querySelectorAll('item');
      const articles = [];
      
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        
        if (link && !this.fetchedNPRFeeds.includes(link)) {
          articles.push({ title, link, description, pubDate });
        }
      });
      
      // 按发布日期排序（处理无效日期）
      articles.sort((a, b) => {
        const dateA = new Date(a.pubDate);
        const dateB = new Date(b.pubDate);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      });
      
      if (articles.length === 0) {
        if (this.fetchedNPRFeeds.length > 50) {
          this.fetchedNPRFeeds = this.fetchedNPRFeeds.slice(-50);
          this.saveNPRHistory();
        }
        
        if (confirm('本栏目所有最新文章都已抓取过。是否清空记录重新抓取？')) {
          this.fetchedNPRFeeds = [];
          return this.fetchNPRNews();
        }
        
        if (status) status.textContent = '暂无新文章';
        if (btn) btn.disabled = false;
        return;
      }
      
      // 选择最新的一篇文章
      const selectedArticle = articles[0];
      this.fetchedNPRFeeds.push(selectedArticle.link);
      this.saveNPRHistory();
      
      if (status) status.textContent = '正在获取文章内容...';
      
      const articleProxy = `${settings.proxyUrl}/api/npr/article?url=${encodeURIComponent(selectedArticle.link)}`;
      const articleRes = await fetch(articleProxy);
      const articleData = await articleRes.json();
      
      if (articleData.content) {
        // 解析日期，处理无效日期情况
        let dateStr = selectedArticle.pubDate;
        const pubDate = new Date(selectedArticle.pubDate);
        if (!isNaN(pubDate)) {
          dateStr = pubDate.toLocaleDateString('zh-CN');
        }
        
        this.nprCurrentArticle = {
          title: articleData.title || selectedArticle.title,
          content: articleData.content,
          description: selectedArticle.description,
          link: selectedArticle.link,
          pubDate: dateStr,
          source: 'NPR'
        };
        
        if (contentDiv) {
          contentDiv.innerHTML = `
            <h5 class="font-bold mb-2">${this.nprCurrentArticle.title}</h5>
            <p class="text-xs text-amber-600 mb-2">📅 发布日期：${dateStr}</p>
            <p class="text-xs text-gray-500 mb-2">${this.nprCurrentArticle.content.substring(0, 300)}...</p>
          `;
        }
        if (preview) preview.classList.remove('hidden');
        if (status) status.textContent = '文章获取成功！';
      } else {
        throw new Error('No content extracted');
      }
      
    } catch (error) {
      console.error('NPR fetch error:', error);
      if (status) status.textContent = '获取失败: ' + error.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  },
  
  // 处理 NPR 内容（AI提取）
  async processNPRContent() {
    if (!this.nprCurrentArticle) {
      alert('请先获取新闻文章');
      return;
    }
    
    const progress = document.getElementById('npr-progress');
    const status = document.getElementById('npr-status');
    
    if (status) status.textContent = '正在使用AI提取学习条目...';
    
    try {
      const material = {
        id: `npr_${Date.now()}`,
        moduleId: this.currentModule,
        title: `NPR: ${this.nprCurrentArticle.title.substring(0, 50)}...`,
        content: this.nprCurrentArticle.content,
        sourceFile: this.nprCurrentArticle.link,
        source: this.nprCurrentArticle.source,
        createdAt: new Date()
      };
      
      await db.materials.put(material);
      await this.processMaterialWithAI(material);
      
      const preview = document.getElementById('npr-preview');
      if (preview) preview.classList.add('hidden');
      this.nprCurrentArticle = null;
      await this.loadModuleMaterials();
      
      alert('成功从 NPR 新闻中提取学习条目！');
      
    } catch (error) {
      console.error('NPR processing error:', error);
      if (status) status.textContent = '处理失败: ' + error.message;
    }
  },
  
  // 切换英语新闻源选项卡
  switchEnglishNewsSource(source) {
    // 隐藏所有面板
    document.querySelectorAll('.news-panel').forEach(panel => {
      panel.classList.add('hidden');
    });
    
    // 显示选中的面板
    const selectedPanel = document.getElementById(`panel-${source}`);
    if (selectedPanel) selectedPanel.classList.remove('hidden');
    
    // 更新选项卡样式
    const tabs = ['bbc', 'npr', 'guardian'];
    const colors = {
      'bbc': { border: 'border-red-600', text: 'text-red-600' },
      'npr': { border: 'border-blue-700', text: 'text-blue-700' },
      'guardian': { border: 'border-blue-600', text: 'text-blue-600' }
    };
    
    tabs.forEach(tab => {
      const tabEl = document.getElementById(`tab-${tab}`);
      if (tabEl) {
        if (tab === source) {
          tabEl.classList.remove('border-transparent', 'text-gray-500');
          tabEl.classList.add(colors[tab].border, colors[tab].text);
        } else {
          tabEl.classList.remove(colors[tab].border, colors[tab].text);
          tabEl.classList.add('border-transparent', 'text-gray-500');
        }
      }
    });
  },
  
  // 渲染新闻源导入区域
  renderNewsImport(moduleId) {
    const container = document.getElementById('news-import-container');
    if (!container) return;
    
    if (moduleId === 'german') {
      container.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg p-6 border border-primary-100">
          <h4 class="text-lg font-bold mb-4">📰 从 ZDF Heute 导入新闻</h4>
          <p class="text-sm text-primary-500 mb-3">自动抓取 ZDF Heute 最新文章，AI提取学习条目。每次抓取的文章不重复。</p>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p class="text-xs text-amber-700">⚠️ 国内用户注意：获取新闻功能需要访问海外服务器，请开启 VPN 后使用。</p>
          </div>
          <div class="flex flex-wrap gap-3 items-center">
            <button onclick="app.fetchZDFNews()" id="zdf-fetch-btn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
              🔍 获取新闻文章
            </button>
            <button onclick="app.clearZDFHistory()" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors" title="清空已抓取记录">
              🗑️ 清空记录
            </button>
            <span class="text-sm text-primary-500">来源：zdfheute.de</span>
          </div>
          <div id="zdf-progress" class="hidden mt-3">
            <div class="flex items-center gap-2 text-sm text-primary-600">
              <svg class="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span id="zdf-status">正在获取文章...</span>
            </div>
          </div>
          <div id="zdf-preview" class="hidden mt-4 p-4 bg-gray-50 rounded-lg">
            <div class="font-medium text-sm mb-2">文章预览：</div>
            <div id="zdf-content" class="text-sm text-primary-600 max-h-32 overflow-y-auto mb-3"></div>
            <button onclick="app.processZDFContent()" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">
              🧠 AI提取学习条目
            </button>
          </div>
        </div>
      `;
    } else if (moduleId === 'japanese') {
      container.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg p-6 border border-primary-100">
          <h4 class="text-lg font-bold mb-4">🇯🇵 从日语新闻源导入</h4>
          <p class="text-sm text-primary-500 mb-3">自动抓取朝日新聞最新日语文章，AI提取学习条目。</p>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p class="text-xs text-amber-700">⚠️ 国内用户注意：获取新闻功能需要访问海外服务器，请开启 VPN 后使用。</p>
          </div>
          
          <!-- 朝日新聞 -->
          <div class="flex flex-wrap gap-3 items-center mb-3">
            <button onclick="app.fetchAsahiNews()" id="asahi-fetch-btn" class="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors">
              🔍 获取新闻文章
            </button>
            <button onclick="app.clearAsahiHistory()" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors" title="清空已抓取记录">
              🗑️ 清空记录
            </button>
          </div>
          <div class="text-sm text-primary-500">来源：www.asahi.com</div>
          <div id="asahi-progress" class="hidden mt-3">
            <div class="flex items-center gap-2 text-sm text-primary-600">
              <svg class="animate-spin h-4 w-4 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span id="asahi-status">正在获取文章...</span>
            </div>
          </div>
          <div id="asahi-preview" class="hidden mt-4 p-4 bg-gray-50 rounded-lg">
            <div class="font-medium text-sm mb-2">文章预览：</div>
            <div id="asahi-content" class="text-sm text-primary-600 max-h-32 overflow-y-auto mb-3"></div>
            <button onclick="app.processAsahiContent()" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">
              🧠 AI提取学习条目
            </button>
          </div>
        </div>
      `;
    } else if (moduleId === 'english') {
      container.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg p-6 border border-primary-100">
          <h4 class="text-lg font-bold mb-4">📰 从英语新闻源导入</h4>
          <p class="text-sm text-primary-500 mb-3">自动抓取 BBC、NPR、The Guardian 最新英语文章，AI提取学习条目。</p>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
            <p class="text-xs text-amber-700">⚠️ 国内用户注意：获取新闻功能需要访问海外服务器，请开启 VPN 后使用。</p>
          </div>
          
          <!-- 新闻源选项卡 -->
          <div class="flex gap-2 mb-4 border-b border-gray-200">
            <button onclick="app.switchEnglishNewsSource('bbc')" id="tab-bbc" class="px-4 py-2 text-sm font-medium border-b-2 border-red-600 text-red-600">
              📺 BBC News
            </button>
            <button onclick="app.switchEnglishNewsSource('npr')" id="tab-npr" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              📻 NPR
            </button>
            <button onclick="app.switchEnglishNewsSource('guardian')" id="tab-guardian" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
              📰 The Guardian
            </button>
          </div>
          
          <!-- BBC News Panel -->
          <div id="panel-bbc" class="news-panel">
            <div class="flex flex-wrap gap-3 items-center mb-3">
              <select id="bbc-category" onchange="app.bbcCategory = this.value" class="px-3 py-2 border border-primary-200 rounded-lg text-sm">
                <option value="world">🌍 国际</option>
                <option value="business">📈 商业</option>
                <option value="technology">💻 科技</option>
                <option value="science">🔬 科学</option>
                <option value="health">🏥 健康</option>
                <option value="uk">英国 (UK)</option>
                <option value="politics">🏛️ 政治</option>
              </select>
              <button onclick="app.fetchBBCNews()" id="bbc-fetch-btn" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                🔍 获取新闻文章
              </button>
              <button onclick="app.clearBBCHistory()" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors" title="清空已抓取记录">
                🗑️ 清空记录
              </button>
            </div>
            <div class="text-sm text-primary-500">来源：bbc.com/news</div>
            <div id="bbc-progress" class="hidden mt-3">
              <div class="flex items-center gap-2 text-sm text-primary-600">
                <svg class="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span id="bbc-status">正在获取文章...</span>
              </div>
            </div>
            <div id="bbc-preview" class="hidden mt-4 p-4 bg-gray-50 rounded-lg">
              <div class="font-medium text-sm mb-2">文章预览：</div>
              <div id="bbc-content" class="text-sm text-primary-600 max-h-32 overflow-y-auto mb-3"></div>
              <button onclick="app.processBBCContent()" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">
                🧠 AI提取学习条目
              </button>
            </div>
          </div>
          
          <!-- NPR News Panel -->
          <div id="panel-npr" class="news-panel hidden">
            <div class="flex flex-wrap gap-3 items-center mb-3">
              <select id="npr-category" onchange="app.nprCategory = this.value" class="px-3 py-2 border border-primary-200 rounded-lg text-sm">
                <option value="news">📰 头条</option>
                <option value="world">🌍 国际</option>
                <option value="usa">美国 (US)</option>
                <option value="business">📈 商业</option>
                <option value="science">🔬 科学</option>
                <option value="health">🏥 健康</option>
                <option value="tech">💻 科技</option>
              </select>
              <button onclick="app.fetchNPRNews()" id="npr-fetch-btn" class="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors">
                🔍 获取新闻文章
              </button>
              <button onclick="app.clearNPRHistory()" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors" title="清空已抓取记录">
                🗑️ 清空记录
              </button>
            </div>
            <div class="text-sm text-primary-500">来源：npr.org</div>
            <div id="npr-progress" class="hidden mt-3">
              <div class="flex items-center gap-2 text-sm text-primary-600">
                <svg class="animate-spin h-4 w-4 text-blue-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span id="npr-status">正在获取文章...</span>
              </div>
            </div>
            <div id="npr-preview" class="hidden mt-4 p-4 bg-gray-50 rounded-lg">
              <div class="font-medium text-sm mb-2">文章预览：</div>
              <div id="npr-content" class="text-sm text-primary-600 max-h-32 overflow-y-auto mb-3"></div>
              <button onclick="app.processNPRContent()" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">
                🧠 AI提取学习条目
              </button>
            </div>
          </div>
          
          <!-- The Guardian Panel -->
          <div id="panel-guardian" class="news-panel hidden">
            <div class="flex flex-wrap gap-3 items-center mb-3">
              <select id="guardian-category" onchange="app.guardianCategory = this.value" class="px-3 py-2 border border-primary-200 rounded-lg text-sm">
                <option value="world">🌍 国际</option>
                <option value="uk">英国 (UK)</option>
                <option value="us">美国 (US)</option>
                <option value="business">📈 商业</option>
                <option value="science">🔬 科学</option>
                <option value="technology">💻 科技</option>
                <option value="culture">🎨 文化</option>
              </select>
              <button onclick="app.fetchGuardianNews()" id="guardian-fetch-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                🔍 获取新闻文章
              </button>
              <button onclick="app.clearGuardianHistory()" class="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition-colors" title="清空已抓取记录">
                🗑️ 清空记录
              </button>
            </div>
            <div class="text-sm text-primary-500">来源：theguardian.com</div>
            <div id="guardian-progress" class="hidden mt-3">
              <div class="flex items-center gap-2 text-sm text-primary-600">
                <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span id="guardian-status">正在获取文章...</span>
              </div>
            </div>
            <div id="guardian-preview" class="hidden mt-4 p-4 bg-gray-50 rounded-lg">
              <div class="font-medium text-sm mb-2">文章预览：</div>
              <div id="guardian-content" class="text-sm text-primary-600 max-h-32 overflow-y-auto mb-3"></div>
              <button onclick="app.processGuardianContent()" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">
                🧠 AI提取学习条目
              </button>
            </div>
          </div>
        </div>
      `;
      
      // 初始化显示 BBC 选项卡
      this.switchEnglishNewsSource('bbc');
    } else {
      // 其他语言暂无新闻源
      container.innerHTML = '';
    }
  },
  
  // 从 ZDF Heute 获取新闻
  async fetchZDFNews() {
    // 确保历史记录已加加载
    if (this.fetchedZDFFeeds.length === 0) {
      this.loadZDFHistory();
    }
    
    const btn = document.getElementById('zdf-fetch-btn');
    const progress = document.getElementById('zdf-progress');
    const status = document.getElementById('zdf-status');
    const preview = document.getElementById('zdf-preview');
    const contentDiv = document.getElementById('zdf-content');
    
    try {
      const settings = await this.getSettings();
      const PROXY_BASE_URL = settings.proxyUrl;
      
      btn.disabled = true;
      progress.classList.remove('hidden');
      status.textContent = '正在获取 ZDF Heute 资讯...';
      
      const apiUrl = `${PROXY_BASE_URL}/api/zdf/rss`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('RSS 获取失败');
      
      // corsproxy.io 直接返回原始内容
      const rssContent = await response.text();
      
      // 解析 RSS XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rssContent, 'text/xml');
      const items = xmlDoc.querySelectorAll('item');
      
      if (items.length === 0) {
        throw new Error('未找到文章');
      }
      
      // 找到未获取过的文章
      let selectedArticle = null;
      for (const item of items) {
        const link = item.querySelector('link')?.textContent;
        if (link && !this.fetchedZDFFeeds.includes(link)) {
          selectedArticle = {
            title: item.querySelector('title')?.textContent || '',
            link: link,
            description: item.querySelector('description')?.textContent || '',
            pubDate: item.querySelector('pubDate')?.textContent || ''
          };
          break;
        }
      }
      
      // 如果所有文章都获取过了
      if (!selectedArticle) {
        // 保留最近的50条记录，删除旧的，这样可以循环使用
        if (this.fetchedZDFFeeds.length > 50) {
          this.fetchedZDFFeeds = this.fetchedZDFFeeds.slice(-50);
          this.saveZDFHistory();
        }
        
        // 告诉用户所有文章都已抓取
        const shouldReset = confirm('最近的文章都已抓取过了。\n\n要清空历史记录并重新开始吗？');
        if (shouldReset) {
          this.fetchedZDFFeeds = [];
          // 重新尝试获取第一篇
          const firstItem = items[0];
          selectedArticle = {
            title: firstItem.querySelector('title')?.textContent || '',
            link: firstItem.querySelector('link')?.textContent || '',
            description: firstItem.querySelector('description')?.textContent || '',
            pubDate: firstItem.querySelector('pubDate')?.textContent || ''
          };
        } else {
          throw new Error('没有新文章可抓取');
        }
      }
      
      // 记录已获取并保存
      this.fetchedZDFFeeds.push(selectedArticle.link);
      this.saveZDFHistory();
      
      // 获取正文内容（通过全文 RSS 或简介）
      status.textContent = '正在解析文章内容...';
      
      // 尝试获取完整内容
      let fullContent = selectedArticle.description;
      try {
        const articleProxy = `${settings.proxyUrl}/api/zdf/article?url=${encodeURIComponent(selectedArticle.link)}`;
        const articleRes = await fetch(articleProxy);
        if (articleRes.ok) {
          const articleData = await articleRes.json();
          // 后端已经提取好正文内容
          fullContent = articleData.content || selectedArticle.description;
        }
      } catch (e) {
        console.log('无法获取完整内容，使用简介');
      }
      
      // 解析日期
      let dateStr = selectedArticle.pubDate;
      try {
        const pubDate = new Date(selectedArticle.pubDate);
        if (!isNaN(pubDate)) {
          dateStr = pubDate.toLocaleDateString('zh-CN');
        }
      } catch (e) {
        // 保持原始日期字符串
      }
      
      this.zdfCurrentArticle = {
        title: selectedArticle.title,
        content: fullContent,
        link: selectedArticle.link,
        pubDate: dateStr,
        source: 'ZDF Heute'
      };
      
      // 显示预览
      contentDiv.innerHTML = `
        <div class="font-bold mb-1">${selectedArticle.title}</div>
        <div class="text-xs text-amber-600 mb-2">📅 发布日期：${dateStr}</div>
        <div class="text-gray-600">${fullContent.substring(0, 500)}...</div>
      `;
      preview.classList.remove('hidden');
      status.textContent = '获取成功！';
      
    } catch (error) {
      console.error('ZDF fetch error:', error);
      alert('获取失败: ' + error.message + '\n\n请检查网络连接或稍后重试。');
    } finally {
      btn.disabled = false;
      setTimeout(() => progress.classList.add('hidden'), 2000);
    }
  },
  
  // 处理 ZDF 内容（AI提取）
  async processZDFContent() {
    if (!this.zdfCurrentArticle) {
      alert('请先获取新闻文章');
      return;
    }
    
    const progress = document.getElementById('zdf-progress');
    const status = document.getElementById('zdf-status');
    
    try {
      progress.classList.remove('hidden');
      status.textContent = '正在使用AI提取学习条目...';
      
      // 保存为材料
      const material = {
        id: `zdf_${Date.now()}`,
        moduleId: this.currentModule,
        title: `ZDF: ${this.zdfCurrentArticle.title.substring(0, 50)}...`,
        content: this.zdfCurrentArticle.content,
        sourceFile: this.zdfCurrentArticle.link,
        source: this.zdfCurrentArticle.source,
        createdAt: new Date()
      };
      
      await db.materials.put(material);
      
      // 使用AI处理
      await this.processMaterialWithAI(material);
      
      // 清空状态
      document.getElementById('zdf-preview').classList.add('hidden');
      this.zdfCurrentArticle = null;
      status.textContent = '完成！';
      
      alert('成功从 ZDF 新闻中提取学习条目！');
      
    } catch (error) {
      console.error('ZDF processing error:', error);
      alert('处理失败: ' + error.message);
    } finally {
      setTimeout(() => progress.classList.add('hidden'), 2000);
    }
  },
  
  // 从 localStorage 加载已抓取的朝日新聞文章历史
  loadAsahiHistory() {
    try {
      const history = localStorage.getItem('asahi_fetched_history');
      if (history) {
        this.fetchedAsahiFeeds = JSON.parse(history);
        console.log(`Loaded ${this.fetchedAsahiFeeds.length} Asahi articles from history`);
      }
    } catch (e) {
      console.error('Failed to load Asahi history:', e);
      this.fetchedAsahiFeeds = [];
    }
  },
  
  // 保存朝日新聞抓取历史到 localStorage
  saveAsahiHistory() {
    try {
      localStorage.setItem('asahi_fetched_history', JSON.stringify(this.fetchedAsahiFeeds));
    } catch (e) {
      console.error('Failed to save Asahi history:', e);
    }
  },
  
  // 清空朝日新聞抓取历史
  clearAsahiHistory() {
    if (confirm('确定要清空已抓取的文章记录吗？清空后可以重新抓取之前的文章。')) {
      this.fetchedAsahiFeeds = [];
      localStorage.removeItem('asahi_fetched_history');
      alert('已清空抓取记录');
    }
  },
  
  // 从朝日新聞获取新闻
  async fetchAsahiNews() {
    if (this.fetchedAsahiFeeds.length === 0) {
      this.loadAsahiHistory();
    }
    
    const btn = document.getElementById('asahi-fetch-btn');
    const progress = document.getElementById('asahi-progress');
    const status = document.getElementById('asahi-status');
    const preview = document.getElementById('asahi-preview');
    const contentDiv = document.getElementById('asahi-content');
    
    if (btn) btn.disabled = true;
    if (progress) progress.classList.remove('hidden');
    if (preview) preview.classList.add('hidden');
    if (status) status.textContent = '正在获取朝日新聞...';
    
    try {
      const settings = await this.getSettings();
      const PROXY_BASE_URL = settings.proxyUrl;
      const apiUrl = `${PROXY_BASE_URL}/api/asahi/rss`;
      
      console.log('Fetching Asahi RSS:', apiUrl);
      
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch RSS');
      
      const rssText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rssText, 'text/xml');
      
      const items = xmlDoc.querySelectorAll('item');
      const articles = [];
      
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        // 朝日 RSS 使用 dc:date 而不是 pubDate
        let pubDate = item.querySelector('pubDate')?.textContent || '';
        if (!pubDate) {
          // 尝试获取 dc:date (需要处理命名空间)
          const dateEl = item.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'date')[0];
          pubDate = dateEl?.textContent || '';
        }
        
        if (link && !this.fetchedAsahiFeeds.includes(link)) {
          articles.push({ title, link, description, pubDate });
        }
      });
      
      // 按日期排序，处理无效日期的情况
      articles.sort((a, b) => {
        const dateA = new Date(a.pubDate);
        const dateB = new Date(b.pubDate);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      });
      
      if (articles.length === 0) {
        if (this.fetchedAsahiFeeds.length > 50) {
          this.fetchedAsahiFeeds = this.fetchedAsahiFeeds.slice(-50);
          this.saveAsahiHistory();
        }
        
        if (confirm('所有最新文章都已抓取过。是否清空记录重新抓取？')) {
          this.fetchedAsahiFeeds = [];
          return this.fetchAsahiNews();
        }
        
        if (status) status.textContent = '暂无新文章';
        if (btn) btn.disabled = false;
        return;
      }
      
      const selectedArticle = articles[0];
      this.fetchedAsahiFeeds.push(selectedArticle.link);
      this.saveAsahiHistory();
      
      if (status) status.textContent = '正在获取文章内容...';
      
      const articleProxy = `${PROXY_BASE_URL}/api/asahi/article?url=${encodeURIComponent(selectedArticle.link)}`;
      const articleRes = await fetch(articleProxy);
      const articleData = await articleRes.json();
      
      if (articleData.content) {
        // 处理日期 - 朝日 RSS 使用 dc:date 格式
        let dateStr = '日期未知';
        if (selectedArticle.pubDate) {
          const pubDate = new Date(selectedArticle.pubDate);
          if (!isNaN(pubDate)) {
            dateStr = pubDate.toLocaleDateString('ja-JP');
          }
        }
        
        this.asahiCurrentArticle = {
          title: articleData.title || selectedArticle.title,
          content: articleData.content,
          description: selectedArticle.description,
          link: selectedArticle.link,
          pubDate: dateStr,
          source: articleData.source || '朝日新聞'
        };
        
        if (contentDiv) {
          const contentLength = this.asahiCurrentArticle.content.length;
          contentDiv.innerHTML = `
            <div class="font-bold mb-2">${this.escapeHtml(this.asahiCurrentArticle.title)}</div>
            <div class="text-xs text-gray-500 mb-2">${this.asahiCurrentArticle.source} · ${this.asahiCurrentArticle.pubDate} · ${contentLength}字</div>
            <div class="text-xs text-gray-600 line-clamp-4">${this.escapeHtml(this.asahiCurrentArticle.content.substring(0, 300))}${contentLength > 300 ? '...' : ''}</div>
          `;
        }
        
        if (preview) preview.classList.remove('hidden');
        if (status) status.textContent = '获取成功！';
      } else {
        throw new Error('无法解析文章内容');
      }
      
    } catch (error) {
      console.error('Asahi fetch error:', error);
      alert('获取失败: ' + error.message + '\n\n请检查网络连接或稍后重试。');
    } finally {
      if (btn) btn.disabled = false;
      setTimeout(() => progress?.classList.add('hidden'), 2000);
    }
  },
  
  // 处理朝日新聞内容（AI提取）
  async processAsahiContent() {
    if (!this.asahiCurrentArticle) {
      alert('请先获取新闻文章');
      return;
    }
    
    const progress = document.getElementById('asahi-progress');
    const status = document.getElementById('asahi-status');
    
    try {
      progress.classList.remove('hidden');
      status.textContent = '正在使用AI提取学习条目...';
      
      const material = {
        id: `asahi_${Date.now()}`,
        moduleId: this.currentModule,
        title: `朝日: ${this.asahiCurrentArticle.title.substring(0, 50)}...`,
        content: this.asahiCurrentArticle.content,
        sourceFile: this.asahiCurrentArticle.link,
        source: this.asahiCurrentArticle.source,
        createdAt: new Date()
      };
      
      await db.materials.put(material);
      await this.processMaterialWithAI(material);
      
      document.getElementById('asahi-preview').classList.add('hidden');
      this.asahiCurrentArticle = null;
      status.textContent = '完成！';
      
      alert('成功从朝日新聞中提取学习条目！');
      
    } catch (error) {
      console.error('Asahi processing error:', error);
      alert('处理失败: ' + error.message);
    } finally {
      setTimeout(() => progress.classList.add('hidden'), 2000);
    }
  },
  
  // 批量导入词汇（简化版 - 只需单词列表，AI补全所有信息）
  async bulkImportVocabulary() {
    const textArea = document.getElementById('bulk-import-text');
    const text = textArea.value.trim();
    
    if (!text) {
      alert('请粘贴单词列表');
      return;
    }
    
    if (!this.currentModule) {
      alert('请先选择一个模块');
      return;
    }
    
    const settings = await this.getSettings();
    if (!settings.apiKey) {
      alert('未配置AI API，请先在设置中配置API密钥');
      return;
    }
    
    try {
      // 解析单词列表（纯单词，无需词性格式）
      const words = this.parseSimpleWordList(text);
      
      if (words.length === 0) {
        alert('未能解析出有效单词，请确保每行一个单词或用空格分隔');
        return;
      }
      
      // 确认导入
      const preview = words.slice(0, 10).join(', ');
      const confirmed = confirm(`解析到 ${words.length} 个词条\n\n预览前10个：${preview}${words.length > 10 ? '...' : ''}\n\n确认导入？`);
      if (!confirmed) return;
      
      const progressDiv = document.getElementById('bulk-import-progress');
      const statusSpan = document.getElementById('bulk-import-status');
      progressDiv.classList.remove('hidden');
      
      // 创建基础条目数组（只有original，其他信息由AI补充）
      let entries = words.map(word => ({
        type: 'word',
        original: word,
        translation: '',
        explanation: '',
        example: '',
        gender: '',
        wordType: '',
        srsLevel: 0,
        nextReview: Date.now(),
        interval: 0,
        easeFactor: 2.5
      }));
      
      // 使用AI补全所有信息
      // 每批处理5个，确保质量
      const batchSize = 5;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        statusSpan.textContent = `正在使用AI补全词条信息... (${Math.min(i + batchSize, entries.length)}/${entries.length})`;
        
        await this.enrichEntriesCompleteWithAI(batch, settings);
        
        // 添加延迟避免频率限制
        if (i + batchSize < entries.length) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }
      
      progressDiv.classList.add('hidden');
      
      // 添加模块ID
      entries.forEach(entry => {
        entry.moduleId = this.currentModule;
      });
      
      // 保存到数据库 - 逐个添加以获取ID
      console.log('Saving entries to DB:', entries.length);
      for (let i = 0; i < entries.length; i++) {
        try {
          entries[i].id = await db.entries.add(entries[i]);
        } catch (err) {
          console.error('Failed to add entry:', entries[i], err);
        }
      }
      
      // 刷新仪表板
      await this.loadDashboard();
      await this.loadEntries();
      
      // 清空输入框
      textArea.value = '';
      
      alert(`成功导入 ${entries.length} 个词汇！AI已自动补全词性、翻译、用法和例句。`);
      
      // 切换到单词标签
      this.switchModuleTab('words');
      
    } catch (error) {
      console.error('Bulk import failed:', error);
      
      // 检测数据库升级错误
      if (error.name === 'UpgradeError' || (error.message && error.message.includes('primary key'))) {
        const shouldReset = confirm('数据库结构需要更新才能继续导入。\n\n点击"确定"清空本地数据并刷新页面（建议先导出重要数据），或点击"取消"手动刷新。');
        if (shouldReset) {
          await db.delete();
          location.reload();
        }
      } else {
        alert('导入失败: ' + error.message);
      }
    }
  },
  
  // 使用AI补全词条信息
  async enrichEntriesWithAI(entries, settings) {
    const isGerman = this.currentModule === 'german';
    const isJapanese = this.currentModule === 'japanese';
    const mod = this.modules[this.currentModule];
    
    const wordsList = entries.map(e => {
      let info = e.original;
      if (e.gender) info += ` (${e.gender})`;
      if (e.wordType) info += ` - ${e.wordType}`;
      return info;
    }).join('\n');
    
    const genderDesc = isGerman 
      ? '- gender: 性别标记 m./f./n./pl. 或空（必须为名词标注der/die/das）'
      : '- gender: 非德语语言此字段留空';
    
    const japaneseDesc = isJapanese ? `
日语特殊要求：
- 含汉字词汇：original格式为"汉字(平假名)"，如"日本語(にほんご)"，复合词整体标注
- 片假名外来语：original格式为"片假名(英语原文)"，如"アイスクリーム(ice cream)"
- 示例句子中的汉字必须标注平假名读音，复合词整体标注` : '';
    
    const prompt = isJapanese
      ? `你是一位专业的日语教学专家。请为以下日语词汇补全完整信息。

【重要 - 注音规则】
1. 单词读音（original）：
   - 含汉字的词汇：整体标注读音，如"学生(がくせい)"
   - 片假名外来语：标注来源，如"アイスクリーム(ice cream)"

2. 例句注音（example）- 关键规则：
   - 复合词整体标注，不要逐字拆开
   - 正确："大人(おとな)"、"引き付ける(ひきつける)"
   - 错误："大(お)人(とな)"、"引(ひ)き(つ)付(つ)ける"

3. 必须注音的汉字（无一例外）：
   - "随分(ずいぶん)" → 副词，表示"相当、很"
   - "当然(とうぜん)" → 副词，表示"当然"
   - "大人(おとな)" → 名词，表示"成年人"
   - "学生(がくせい)" → 名词，表示"学生"

4. 严禁不注音的汉字（错误示例）：
   - ❌ 错误："随分" → ✅ 正确："随分(ずいぶん)"
   - ❌ 错误："当然" → ✅ 正确："当然(とうぜん)"
   - ❌ 错误："引き付ける" → ✅ 正确："引き付ける(ひきつける)"

5. 常见错误纠正：
   - "大人" → 大人(おとな)，不要大(お)人(とな)
   - "引き付ける" → 引き付ける(ひきつける)，不要拆开

请严格按照以下格式返回JSON数组，每个词条包含：
- original: 原词（含读音标注，如"学生(がくせい)"）
- translation: 中文翻译
- wordType: 词性（名词、他动词·五段/一段、自动词·五段/一段、い形容词、な形容动词等）
- gender: 留空
- explanation: 用法说明
- example: 示例句子（所有汉字必须注音，如"私(わたし)は随分(ずいぶん)疲(つか)れました。"）

请为以下词汇补全信息：
${wordsList}

返回格式：[{"original": "...", "translation": "...", "wordType": "...", "gender": "", "explanation": "...", "example": "..."}]`
      : `你是一位${mod.name}教学专家。请为以下${mod.language}词汇补全中文翻译、用法解释和示例句子。

请严格按照以下格式返回JSON数组，每个词条包含：
- original: 原词
- translation: 中文翻译（简洁准确）
- wordType: 词的类型（与输入保持一致）
${genderDesc}
- explanation: 用法说明（包括搭配、语义、使用场景等，100字以内）
- example: 示例句子（原文 + 中文翻译）

重要提示：示例句子可以由你根据词义和用法自行生成，不需要来源于原文，但必须正确展示该词的用法。

请为以下词汇补全信息：
${wordsList}

返回格式：[{"original": "...", "translation": "...", "wordType": "...", "gender": "...", "explanation": "...", "example": "..."}]`;

    try {
      const response = await fetch(`${settings.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: `你是一位专业的${mod.name}教学专家，擅长提供准确的中文翻译和实用的示例。请返回有效的JSON数组。` },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: settings.maxTokens || (isJapanese ? 16000 : 8000)
        })
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content;
      
      console.log('AI response for', mod.name, ':', content.substring(0, 500));
      
      // 检查响应是否被截断
      if (data.choices[0].finish_reason === 'length') {
        console.warn('AI response was truncated due to max_tokens limit');
        throw new Error('Response truncated: increase max_tokens setting');
      }
      
      // 解析JSON - 使用多种方式尝试提取
      let enrichedData = null;
      const jsonPatterns = [
        /```json\s*([\s\S]*?)```/,
        /```\s*([\s\S]*?)```/,
        /\[[\s\S]*\]/
      ];
      
      for (const pattern of jsonPatterns) {
        const match = content.match(pattern);
        if (match) {
          let jsonStr = match[1] || match[0];
          try {
            enrichedData = JSON.parse(jsonStr);
            break;
          } catch (e) {
            // 尝试修复格式问题后重新解析
            try {
              jsonStr = this.fixMalformedJSON(jsonStr);
              enrichedData = JSON.parse(jsonStr);
              break;
            } catch (e2) {
              // 继续尝试下一个模式
            }
          }
        }
      }
      
      // 尝试更宽松的提取
      if (!enrichedData) {
        const startIdx = content.indexOf('[');
        const endIdx = content.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
          let jsonStr = content.substring(startIdx, endIdx + 1);
          try {
            enrichedData = JSON.parse(jsonStr);
          } catch (e) {
            // 尝试修复
            try {
              jsonStr = this.fixMalformedJSON(jsonStr);
              enrichedData = JSON.parse(jsonStr);
            } catch (e2) {
              console.error('Failed to parse JSON. Content:', content);
            }
          }
        }
      }
      
      if (enrichedData && Array.isArray(enrichedData)) {
        // 将AI补全的信息合并到原条目
        entries.forEach((entry, index) => {
          if (enrichedData[index]) {
            const enriched = enrichedData[index];
            // 更新original保留AI添加的注音（如日语假名）
            entry.original = enriched.original || entry.original;
            entry.translation = enriched.translation || '';
            entry.wordType = enriched.wordType || entry.wordType;
            entry.gender = enriched.gender || entry.gender;
            entry.explanation = enriched.explanation || entry.explanation;
            entry.example = enriched.example || '';
          }
        });
      }
    } catch (error) {
      console.error('AI enrichment failed:', error);
      // AI补全失败时，保留原始解析的数据，添加提示
      entries.forEach(entry => {
        if (!entry.translation || entry.translation === '') {
          entry.translation = `（需手动补充）`;
          entry.explanation = entry.explanation || 'AI补全失败，请手动编辑补充信息';
        }
      });
    }
  },
  
  // 解析简单单词列表（一行一个或空格分隔，无需词性格式）
  parseSimpleWordList(content) {
    const words = [];
    const seen = new Set();
    
    // 支持换行符或空格分隔
    const lines = content.split(/[\r\n,;]+/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      // 过滤空行、数字、过短的内容（单字符也允许，支持韩语等单字符词汇）
      if (!trimmed || trimmed.length < 1 || /^\d+$/.test(trimmed)) continue;
      
      // 去重
      if (seen.has(trimmed.toLowerCase())) continue;
      seen.add(trimmed.toLowerCase());
      
      words.push(trimmed);
    }
    
    return words;
  },
  
  // AI完整补全：词性、翻译、解释、例句
  async enrichEntriesCompleteWithAI(entries, settings) {
    const isGerman = this.currentModule === 'german';
    const isJapanese = this.currentModule === 'japanese';
    const isEnglish = this.currentModule === 'english';
    const isDefaultModule = isGerman || isJapanese || isEnglish;
    const mod = this.modules[this.currentModule];
    
    const wordsList = entries.map(e => e.original).join('\n');
    
    // 用户口语化需求（非默认模块）
    const userRequirement = !isDefaultModule && mod.customPrompt ? mod.customPrompt : '';
    
    const genderDesc = isGerman 
      ? '- gender: 性别标记 m./f./n./pl. 或空（必须为名词标注der/die/das）'
      : '- gender: 非德语语言此字段留空（英语等语言无需性别标记）';
    
    // 日语特殊处理
    const japaneseDesc = isJapanese ? `
日语特殊要求：
1. 含日文汉字的单词：original格式必须是"汉字(平假名)"，如"学生(がくせい)"
2. 片假名外来语：original格式必须是"片假名(英语原文)"，如"コンピュータ(computer)"
3. 纯平假名单词：保持原样
4. wordType必须详细标注：
   - 动词：他动词·五段/一段、自动词·五段/一段
   - 名词：名词
   - 形容词：い形容词/な形容动词
   - 其他：副词、助词、感叹词等
5. 示例句子中的汉字必须标注平假名读音` : '';
    
    // 用户自定义补全要求（非默认模块）- 支持Markdown格式
    const customPrompt = !isDefaultModule ? (mod.customPrompt ? `

【用户自定义补全要求】
${mod.customPrompt}

请根据以上要求补全词条信息。

【格式约束 - 必须遵守】
1. explanation字段支持Markdown格式，可以使用表格、标题、列表等
2. example字段留空（如果例句已经在explanation中以Markdown形式提供）
3. 返回的所有字段必须是有效的JSON格式` : `

【默认补全要求】
为每个词条提供准确的词性标注、中文翻译。explanation字段支持Markdown格式，可使用表格展示详细信息。`) : '';
    
    const prompt = isJapanese 
      ? `你是一位专业的日语教学专家。请为以下日语单词识别类型并补全完整信息。${customPrompt}

【重要规则 - 注音规范】
1. 单词注音（original字段）：
   - 汉字单词：标注整个词的读音，格式"单词(读音)"，如"学生(がくせい)"
   - 片假名外来语：标注来源，格式"カタカナ(英语原文)"，如"コンピュータ(computer)"
   - 纯平假名：保持原样

2. 例句注音（example字段）- 关键规则：
   - 复合词整体标注：如"大人(おとな)"、"引き付ける(ひきつける)"
   - 不要逐字拆开注音：错误示例"大(お)人(とな)"、"引(ひ)き(つ)付(つ)ける"
   - 动词连用形+助词要整体标注：如"食べて(たべて)"、"行きます(いきます)"

3. 必须注音的汉字（无一例外）：
   - "随分(ずいぶん)" → 副词，表示"相当、很"
   - "当然(とうぜん)" → 副词，表示"当然"
   - "大人(おとな)" → 名词，表示"成年人"
   - "学生(がくせい)" → 名词，表示"学生"

4. 严禁不注音的汉字（错误示例）：
   - ❌ 错误："随分" → ✅ 正确："随分(ずいぶん)"
   - ❌ 错误："当然" → ✅ 正确："当然(とうぜん)"
   - ❌ 错误："引き付ける" → ✅ 正确："引き付ける(ひきつける)"

5. 常见错误纠正：
   - "大人" → 正确：大人(おとな)，错误：大(お)人(とな)
   - "引き付ける" → 正确：引き付ける(ひきつける)，错误：引(ひ)き(つ)付(つ)ける
   - "食べて" → 正确：食べて(たべて)，错误：食(た)べ(べ)て

请严格按照JSON格式返回数组，每个词条包含：
- original: 原词（含读音标注，如"学生(がくせい)"或"コンピュータ(computer)"）
- translation: 中文翻译
- wordType: 详细词性（如"他动词·五段"、"名词"、"な形容动词"等）
- gender: 留空
- explanation: 用法解释（包括搭配、敬体/简体使用场景等）
- example: 示例句子（所有汉字必须注音，如"私(わたし)は随分(ずいぶん)疲(つか)れました。"）

请为以下单词补全信息：
${wordsList}

返回格式：[{"original": "...", "translation": "...", "wordType": "...", "gender": "", "explanation": "...", "example": "..."}]`
      : `
${userRequirement || `你是一位专业的${mod.name}教学专家。请为以下${mod.language}单词识别并补全完整信息。`}

【基础约束】
- 返回格式：合法JSON数组
- 必填字段：type(word/phrase/sentence)、original、translation、wordType
- explanation支持Markdown格式

请为以下单词补全信息：
${wordsList}

返回格式：[{"original": "...", "translation": "...", "wordType": "...", "gender": "...", "explanation": "...", "example": ""}]`;

    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
      try {
        const response = await fetch(`${settings.apiUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
          },
          body: JSON.stringify({
            model: settings.model,
            messages: [
              { role: 'system', content: `你是一位专业的${mod.name}教学专家，擅长提供准确的词性标注、中文翻译和实用的示例。请返回有效的JSON数组。` },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: settings.maxTokens || (isJapanese ? 16000 : 8000)
          })
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        const content = data.choices[0].message.content;
        
        console.log('AI response for', mod.name, ':', content.substring(0, 500));
        
        // 检查响应是否被截断
        if (data.choices[0].finish_reason === 'length') {
          console.warn('AI response was truncated due to max_tokens limit');
          throw new Error('Response truncated: increase max_tokens setting');
        }
        
        // 解析JSON
        let enrichedData = null;
        let parseError = null;
        
        // 尝试多种方式提取JSON
        const jsonPatterns = [
          /```json\s*([\s\S]*?)```/,  // Markdown code block
          /```\s*([\s\S]*?)```/,       // Generic code block
          /\[[\s\S]*\]/                 // Raw JSON array
        ];
        
        for (const pattern of jsonPatterns) {
          const match = content.match(pattern);
          if (match) {
            let jsonStr = match[1] || match[0];
            try {
              enrichedData = JSON.parse(jsonStr);
              break;
            } catch (e) {
              // 尝试修复格式问题后重新解析
              try {
                jsonStr = this.fixMalformedJSON(jsonStr);
                enrichedData = JSON.parse(jsonStr);
                break;
              } catch (e2) {
                parseError = e2;
                // 继续尝试下一个模式
              }
            }
          }
        }
        
        // 如果上面都失败，尝试更宽松的提取
        if (!enrichedData) {
          const startIdx = content.indexOf('[');
          const endIdx = content.lastIndexOf(']');
          if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
            let jsonStr = content.substring(startIdx, endIdx + 1);
            try {
              enrichedData = JSON.parse(jsonStr);
            } catch (e) {
              // 尝试修复
              try {
                jsonStr = this.fixMalformedJSON(jsonStr);
                enrichedData = JSON.parse(jsonStr);
              } catch (e2) {
                parseError = e2;
              }
            }
          }
        }
        
        if (enrichedData && Array.isArray(enrichedData)) {
          // 将AI补全的信息合并到条目
          entries.forEach((entry, index) => {
            if (enrichedData[index]) {
              const enriched = enrichedData[index];
              // 更新original保留AI添加的注音（如日语假名）
              entry.original = enriched.original || entry.original;
              entry.translation = enriched.translation || '';
              entry.wordType = enriched.wordType || '';
              entry.gender = enriched.gender || '';
              entry.explanation = enriched.explanation || '';
              // 处理example可能是对象的情况（如{original, translation}）
              if (typeof enriched.example === 'object' && enriched.example !== null) {
                entry.example = enriched.example.original ? `${enriched.example.original} ${enriched.example.translation || ''}` : JSON.stringify(enriched.example);
              } else {
                entry.example = enriched.example || '';
              }
            } else {
              console.warn(`No enrichment data for entry ${index}:`, entry.original);
            }
          });
          
          // 成功则跳出重试循环
          break;
        } else {
          // 打印完整响应以便调试
          console.error('Failed to parse AI response. Full content:', content);
          console.error('Parse error:', parseError);
          throw new Error('No valid JSON array found in response');
        }
      } catch (error) {
        retries++;
        console.error(`AI enrichment attempt ${retries} failed:`, error);
        
        if (retries > maxRetries) {
          // 所有重试都失败
          entries.forEach((entry, index) => {
            if (!entry.translation) {
              entry.translation = `（AI补全失败: ${error.message}）`;
              entry.explanation = '请手动补充该词条信息';
              entry.wordType = entry.wordType || '未知';
            }
          });
          break;
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  },
  
  // 修复AI返回的JSON中的格式问题
  fixMalformedJSON(jsonStr) {
    // 处理AI返回的JSON中未转义的中文引号
    // 中文引号在JSON字符串值内部会导致解析失败
    let result = '';
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      const charCode = char.charCodeAt(0);
      
      if (escaped) {
        // 当前字符被转义
        result += char;
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        // 转义字符
        result += char;
        escaped = true;
        continue;
      }
      
      if (char === '"' && !inString) {
        // 开始字符串
        inString = true;
        result += char;
        continue;
      }
      
      if (char === '"' && inString) {
        // 结束字符串
        inString = false;
        result += char;
        continue;
      }
      
      if (inString && (charCode === 0x201c || charCode === 0x201d)) {
        // 在字符串内部的中文引号，替换为转义的英文引号
        result += '\\"';
        continue;
      }
      
      result += char;
    }
    
    return result;
  },
  
  // 宽松模式解析（备用）
  parseVocabularyLoose(content) {
    const entries = [];
    const lines = content.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 2) continue;
      
      // 宽松模式：用横线分隔的任何内容
      const parts = trimmed.split(/[-–—]/).map(p => p.trim());
      if (parts.length >= 2) {
        const wordPart = parts[0];
        const typePart = parts[1];
        
        // 提取可能的词性
        let word = wordPart;
        let gender = '';
        const genderMatch = wordPart.match(/^(.+?),\s*(der|die|das|pl\.?)$/i);
        if (genderMatch) {
          word = genderMatch[1].trim();
          const g = genderMatch[2].toLowerCase();
          gender = g === 'der' ? 'm.' : g === 'die' ? 'f.' : g === 'das' ? 'n.' : 'pl.';
        }
        
        entries.push({
          type: 'word',
          original: word,
          translation: '',
          explanation: `词类：${this.translateWordType(typePart)}`,
          example: '',
          gender: gender,
          wordType: typePart,
          srsLevel: 0,
          nextReview: Date.now(),
          interval: 0,
          easeFactor: 2.5
        });
      }
    }
    
    return entries;
  },
  
  async loadModuleMaterials() {
    if (!this.currentModule) return;
    
    const materials = await db.materials.where('moduleId').equals(this.currentModule).toArray();
    const container = document.getElementById('materials-list');
    
    if (materials.length === 0) {
      container.innerHTML = '<p class="text-primary-500 text-center py-8">暂无语料，请上传文件</p>';
      // 即使没有材料，也要更新条目统计数字
      await this.loadEntries();
      return;
    }
    
    // 获取条目统计
    const entriesCount = await db.entries.where('moduleId').equals(this.currentModule).count();
    
    container.innerHTML = materials.map(m => {
      let statusBadge = '';
      if (m.status === 'processing') {
        statusBadge = '<span class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">处理中...</span>';
      } else if (m.status === 'completed') {
        statusBadge = `<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">${m.entryCount || 0} 条目</span>`;
      } else if (m.status === 'error') {
        statusBadge = '<span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">处理失败</span>';
      } else {
        statusBadge = '<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">等待处理</span>';
      }
      
      return `
      <div class="flex items-center justify-between p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors">
        <div class="flex items-center gap-3">
          <span class="text-2xl">📄</span>
          <div>
            <div class="font-medium flex items-center gap-2">
              ${m.title}
              ${statusBadge}
            </div>
            <div class="text-xs text-primary-500">${new Date(m.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="app.previewMaterial('${m.id}')" class="p-2 hover:bg-white rounded-lg transition-colors" title="预览">
            <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </button>
          <button onclick="app.deleteMaterial('${m.id}')" class="p-2 hover:bg-red-50 rounded-lg transition-colors" title="删除">
            <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
    `}).join('');
    
    // 显示条目统计
    if (entriesCount > 0) {
      container.innerHTML = `<div class="mb-4 p-3 bg-accent-50 rounded-lg text-accent-700">共有 ${entriesCount} 个学习条目可复习</div>` + container.innerHTML;
    }
    
    // 加载条目列表
    await this.loadEntries();
  },
  
  // 切换模块内标签
  switchModuleTab(tab) {
    // 更新按钮样式
    ['upload', 'words', 'phrases', 'sentences'].forEach(t => {
      const btn = document.getElementById(`tab-${t}`);
      const panel = document.getElementById(`panel-${t}`);
      if (t === tab) {
        btn.className = 'px-4 py-2 bg-primary-600 text-white rounded-lg transition-colors';
        panel.classList.remove('hidden');
      } else {
        btn.className = 'px-4 py-2 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors';
        panel.classList.add('hidden');
      }
    });
    
    if (tab !== 'upload') {
      this.loadEntries();
    }
  },
  
  // 条目分页状态
  entriesPagination: {
    word: { offset: 0, limit: 200, all: [] },
    phrase: { offset: 0, limit: 200, all: [] },
    sentence: { offset: 0, limit: 200, all: [] }
  },
  
  // 加载条目列表（按类型分类，按original字母顺序排序，分页加载）
  async loadEntries() {
    if (!this.currentModule) return;
    
    const types = ['word', 'phrase', 'sentence'];
    
    for (const type of types) {
      // 获取所有条目并排序
      const allEntries = await db.entries
        .where({ moduleId: this.currentModule, type: type })
        .toArray();
      
      // 按 original 字母顺序排序（不区分大小写）
      allEntries.sort((a, b) => {
        const aText = (a.original || '').toLowerCase().trim();
        const bText = (b.original || '').toLowerCase().trim();
        return aText.localeCompare(bText, undefined, { sensitivity: 'base' });
      });
      
      // 保存全部条目
      this.entriesPagination[type].all = allEntries;
      this.entriesPagination[type].offset = 0;
      
      // 更新计数
      const countEl = document.getElementById(`count-${type}s`);
      if (countEl) countEl.textContent = allEntries.length;
      
      // 渲染列表
      const container = document.getElementById(`entries-${type}s`);
      if (!container) continue;
      
      if (allEntries.length === 0) {
        container.innerHTML = `<p class="text-primary-500 text-center py-8">暂无${type === 'word' ? '单词' : type === 'phrase' ? '短语' : '语句'}，请上传材料或手动添加</p>`;
        continue;
      }
      
      // 初次加载前200条
      this.renderEntriesPage(type);
    }
  },
  
  // 渲染指定页面的条目
  renderEntriesPage(type) {
    const container = document.getElementById(`entries-${type}s`);
    if (!container) return;
    
    const pagination = this.entriesPagination[type];
    const { all, offset, limit } = pagination;
    const entriesToRender = all.slice(0, offset + limit);
    
    let html = entriesToRender.map(e => this.renderEntryCard(e, type)).join('');
    
    // 如果还有更多条目，添加"加载更多"按钮
    if (entriesToRender.length < all.length) {
      const remaining = all.length - entriesToRender.length;
      html += `
        <div class="p-4 text-center">
          <button onclick="app.loadMoreEntries('${type}')" class="px-6 py-2 bg-primary-100 hover:bg-primary-200 text-primary-700 rounded-lg transition-colors">
            加载更多 (${remaining} 条剩余)
          </button>
        </div>
      `;
    }
    
    container.innerHTML = html;
  },
  
  // 加载更多条目
  loadMoreEntries(type) {
    this.entriesPagination[type].offset += this.entriesPagination[type].limit;
    this.renderEntriesPage(type);
  },
  
  // 渲染单个条目卡片
  renderEntryCard(entry, type) {
    // 安全检查：确保 entry 和 entry.id 存在
    if (!entry || !entry.id) {
      console.error('Invalid entry object:', entry);
      return '';
    }
    
    const isGerman = this.currentModule === 'german';
    const isEnglish = this.currentModule === 'english';
    const isJapanese = this.currentModule === 'japanese';
    const isDefaultModule = isGerman || isEnglish || isJapanese;
    const isCustomModule = !isDefaultModule && this.modules[this.currentModule]?.isCustom;
    const isBatchMode = this.batchMode[type];
    const isSelected = this.selectedEntries[type].has(entry.id);
    
    let typeBadge = '';
    if (type === 'word') {
      // 只有德语显示性别，其他语言只显示词类
      const gender = (isGerman && entry.gender) ? `<span class="text-accent-600 font-bold">${entry.gender}</span> ` : '';
      // 显示词的类型（如有）
      const wordTypeLabel = entry.wordType ? `<span class="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs ml-1">${this.translateWordType(entry.wordType)}</span>` : '';
      typeBadge = `<span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">单词</span> ${gender}${wordTypeLabel}`;
    } else if (type === 'phrase') {
      typeBadge = `<span class="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">短语</span>`;
    } else {
      typeBadge = `<span class="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">语句</span>`;
    }
    
    // 批量模式下显示复选框
    const checkboxHtml = isBatchMode ? `
      <div class="mr-3 pt-1">
        <input type="checkbox" 
               id="checkbox-${type}-${entry.id}" 
               ${isSelected ? 'checked' : ''} 
               onclick="app.toggleEntrySelection('${type}', ${entry.id})"
               class="w-5 h-5 rounded border-primary-300 text-accent-600 focus:ring-accent-500 cursor-pointer">
      </div>
    ` : '';
    
    // 非批量模式下显示编辑/删除按钮
    const actionsHtml = !isBatchMode ? `
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onclick="app.editEntry(${JSON.stringify(entry.id).replace(/"/g, '&quot;')})" class="p-2 hover:bg-primary-200 rounded-lg" title="编辑">
          <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
          </svg>
        </button>
        <button onclick="app.deleteEntry(${JSON.stringify(entry.id).replace(/"/g, '&quot;')})" class="p-2 hover:bg-red-100 rounded-lg" title="删除">
          <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
      </div>
    ` : '';
    
    return `
      <div class="p-4 hover:bg-primary-50 transition-colors group ${isSelected ? 'bg-accent-50' : ''}" id="entry-${entry.id}">
        <div class="flex justify-between items-start gap-4">
          <div class="flex items-start flex-1">
            ${checkboxHtml}
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                ${typeBadge}
                <span class="text-lg font-bold text-primary-900">${entry.original}</span>
              </div>
              <div class="text-primary-700 mb-2">${entry.translation || '<span class="text-gray-400">暂无翻译</span>'}</div>
              ${entry.explanation ? (isCustomModule ? 
                `<div class="text-sm text-primary-600 mb-2 prose prose-sm max-w-none markdown-content">${marked.parse(entry.explanation)}</div>` : 
                `<div class="text-sm text-primary-500 mb-1">💡 ${entry.explanation}</div>`) : ''}
              ${entry.example && !isCustomModule ? `<div class="text-sm text-accent-600">📖 ${entry.example}</div>` : ''}
            </div>
          </div>
          ${actionsHtml}
        </div>
      </div>
    `;
  },
  
  // 编辑条目
  async editEntry(entryId) {
    const entry = await db.entries.get(entryId);
    if (!entry) return;
    
    const isGerman = this.currentModule === 'german';
    const isEnglish = this.currentModule === 'english';
    const isJapanese = this.currentModule === 'japanese';
    const isDefaultModule = isGerman || isEnglish || isJapanese;
    const isCustomModule = !isDefaultModule && this.modules[this.currentModule]?.isCustom;
    
    const genderField = isGerman && entry.type === 'word' ? `
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">词性</label>
        <select id="edit-gender" class="w-full px-3 py-2 border border-primary-200 rounded-lg">
          <option value="">无</option>
          <option value="m." ${entry.gender === 'm.' ? 'selected' : ''}>m. 阳性</option>
          <option value="f." ${entry.gender === 'f.' ? 'selected' : ''}>f. 阴性</option>
          <option value="n." ${entry.gender === 'n.' ? 'selected' : ''}>n. 中性</option>
          <option value="pl." ${entry.gender === 'pl.' ? 'selected' : ''}>pl. 复数</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">词的类型</label>
        <input type="text" id="edit-wordType" value="${entry.wordType || ''}" placeholder="如：Substantiv, Verb, Adjektiv..." class="w-full px-3 py-2 border border-primary-200 rounded-lg">
      </div>
    ` : '';
    
    const explanationField = entry.type !== 'sentence' ? (isCustomModule ? `
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">用法解释（支持 Markdown 格式）</label>
        <textarea id="edit-explanation" rows="6" placeholder="支持 Markdown 表格、标题、列表等格式" class="w-full px-3 py-2 border border-primary-200 rounded-lg font-mono text-sm">${entry.explanation || ''}</textarea>
        <p class="text-xs text-primary-400 mt-1">支持 Markdown 语法：**粗体**、*斜体*、| 表格 |、# 标题、- 列表</p>
      </div>
    ` : `
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">用法解释</label>
        <textarea id="edit-explanation" rows="2" class="w-full px-3 py-2 border border-primary-200 rounded-lg">${entry.explanation || ''}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">例句</label>
        <textarea id="edit-example" rows="2" class="w-full px-3 py-2 border border-primary-200 rounded-lg">${entry.example || ''}</textarea>
      </div>
    `) : '';
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h3 class="text-xl font-bold mb-4">编辑${entry.type === 'word' ? '单词' : entry.type === 'phrase' ? '短语' : '语句'}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">${(this.modules[this.currentModule] && this.modules[this.currentModule].language) || '外语'}原文</label>
            <input type="text" id="edit-original" value="${entry.original}" class="w-full px-3 py-2 border border-primary-200 rounded-lg">
          </div>
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">中文翻译</label>
            <input type="text" id="edit-translation" value="${entry.translation}" class="w-full px-3 py-2 border border-primary-200 rounded-lg">
          </div>
          ${genderField}
          ${explanationField}
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="this.closest('.fixed').remove()" class="flex-1 px-4 py-2 border border-primary-300 rounded-lg hover:bg-primary-50">取消</button>
          <button onclick="app.saveEntryEdit(${JSON.stringify(entryId)})" class="flex-1 px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },
  
  // 保存条目编辑
  async saveEntryEdit(entryId) {
    const update = {
      original: document.getElementById('edit-original').value,
      translation: document.getElementById('edit-translation').value
    };
    
    const explanationEl = document.getElementById('edit-explanation');
    if (explanationEl) update.explanation = explanationEl.value;
    
    const exampleEl = document.getElementById('edit-example');
    if (exampleEl) update.example = exampleEl.value;
    
    const genderEl = document.getElementById('edit-gender');
    if (genderEl) update.gender = genderEl.value;
    
    const wordTypeEl = document.getElementById('edit-wordType');
    if (wordTypeEl) update.wordType = wordTypeEl.value;
    
    await db.entries.update(entryId, update);
    
    // 关闭模态框并刷新
    document.querySelector('.fixed.inset-0').remove();
    this.loadEntries();
  },
  
  // 删除条目
  async deleteEntry(entryId) {
    if (!confirm('确定要删除这个条目吗？')) return;
    
    console.log('Deleting entry:', entryId);
    
    try {
      // 检查 entryId 是否有效
      if (!entryId || entryId === 'undefined') {
        console.error('Invalid entryId:', entryId);
        alert('删除失败：条目ID无效');
        return;
      }
      
      // 尝试获取条目确认存在
      const entry = await db.entries.get(entryId);
      if (!entry) {
        console.error('Entry not found:', entryId);
        alert('删除失败：条目不存在或已被删除');
        return;
      }
      
      await db.entries.delete(entryId);
      console.log('Entry deleted successfully:', entryId);
      this.loadEntries();
    } catch (error) {
      console.error('Delete entry failed:', error);
      alert('删除失败: ' + error.message);
    }
  },
  
  // 切换批量选择模式
  toggleBatchMode(type) {
    this.batchMode[type] = !this.batchMode[type];
    
    const batchBtn = document.getElementById(`${type}s-batch-btn`);
    const deleteBtn = document.getElementById(`${type}s-delete-btn`);
    const selectionInfo = document.getElementById(`${type}s-selection-info`);
    
    if (this.batchMode[type]) {
      // 开启批量模式
      batchBtn.textContent = '☑ 取消选择';
      batchBtn.classList.add('bg-accent-100', 'text-accent-700');
      deleteBtn.classList.remove('hidden');
      selectionInfo.classList.remove('hidden');
    } else {
      // 关闭批量模式
      batchBtn.textContent = '☐ 批量选择';
      batchBtn.classList.remove('bg-accent-100', 'text-accent-700');
      deleteBtn.classList.add('hidden');
      selectionInfo.classList.add('hidden');
      
      // 清空选择
      this.selectedEntries[type].clear();
      this.updateSelectionCount(type);
    }
    
    // 重新渲染列表显示复选框
    this.renderEntriesPage(type);
  },
  
  // 切换条目选择状态
  toggleEntrySelection(type, entryId) {
    const selected = this.selectedEntries[type];
    
    if (selected.has(entryId)) {
      selected.delete(entryId);
    } else {
      selected.add(entryId);
    }
    
    this.updateSelectionCount(type);
    
    // 更新复选框状态
    const checkbox = document.getElementById(`checkbox-${type}-${entryId}`);
    if (checkbox) {
      checkbox.checked = selected.has(entryId);
    }
  },
  
  // 更新选择计数显示
  updateSelectionCount(type) {
    const count = this.selectedEntries[type].size;
    const countEl = document.getElementById(`${type}s-selected-count`);
    const deleteBtn = document.getElementById(`${type}s-delete-btn`);
    
    if (countEl) countEl.textContent = count;
    
    // 有选中时显示删除按钮
    if (deleteBtn) {
      if (count > 0) {
        deleteBtn.classList.remove('hidden');
      } else {
        deleteBtn.classList.add('hidden');
      }
    }
  },
  
  // 批量删除条目
  async batchDeleteEntries(type) {
    const selected = this.selectedEntries[type];
    
    if (selected.size === 0) {
      alert('请先选择要删除的条目');
      return;
    }
    
    if (!confirm(`确定要删除选中的 ${selected.size} 个${type === 'word' ? '单词' : type === 'phrase' ? '短语' : '语句'}吗？`)) {
      return;
    }
    
    try {
      let deletedCount = 0;
      for (const entryId of selected) {
        await db.entries.delete(entryId);
        deletedCount++;
      }
      
      // 清空选择
      selected.clear();
      this.updateSelectionCount(type);
      
      // 刷新列表
      await this.loadEntries();
      
      alert(`✅ 已删除 ${deletedCount} 个条目`);
    } catch (error) {
      console.error('Batch delete failed:', error);
      alert('批量删除失败: ' + error.message);
    }
  },
  
  // 查重并删除重复条目（按字母顺序排序）
  async deduplicateEntries(type) {
    const entries = await db.entries
      .where('moduleId').equals(this.currentModule)
      .and(e => e.type === type)
      .toArray();
    
    if (entries.length === 0) {
      alert('当前没有条目');
      return;
    }
    
    // 按original字母顺序排序
    entries.sort((a, b) => a.original.localeCompare(b.original, undefined, { sensitivity: 'base' }));
    
    // 查重（基于original字段，不区分大小写）
    const seen = new Set();
    const duplicates = [];
    const unique = [];
    
    for (const entry of entries) {
      const key = entry.original.toLowerCase().trim();
      if (seen.has(key)) {
        duplicates.push(entry);
      } else {
        seen.add(key);
        unique.push(entry);
      }
    }
    
    if (duplicates.length === 0) {
      alert(`✅ 未发现重复${type === 'word' ? '单词' : type === 'phrase' ? '短语' : '语句'}，已按字母顺序排序`);
      // 刷新显示（已排序）
      await this.loadEntries();
      return;
    }
    
    if (confirm(`发现 ${duplicates.length} 个重复${type === 'word' ? '单词' : type === 'phrase' ? '短语' : '语句'}，是否删除？\n\n保留的条目将按字母顺序排序。`)) {
      // 删除重复条目
      for (const dup of duplicates) {
        await db.entries.delete(dup.id);
      }
      
      // 重新加载条目（显示已排序的结果）
      await this.loadEntries();
      
      alert(`✅ 已删除 ${duplicates.length} 个重复条目，${unique.length} 个条目已按字母顺序排序`);
    }
  },
  
  // 手动添加条目
  addManualEntry(type) {
    const isGerman = this.currentModule === 'german';
    const genderField = isGerman && type === 'word' ? `
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">词性</label>
        <select id="new-gender" class="w-full px-3 py-2 border border-primary-200 rounded-lg">
          <option value="">无</option>
          <option value="m.">m. 阳性</option>
          <option value="f.">f. 阴性</option>
          <option value="n.">n. 中性</option>
          <option value="pl.">pl. 复数</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">词的类型</label>
        <input type="text" id="new-wordType" placeholder="如：Substantiv, Verb, Adjektiv..." class="w-full px-3 py-2 border border-primary-200 rounded-lg">
      </div>
    ` : '';
    
    const explanationField = type !== 'sentence' ? `
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">用法解释</label>
        <textarea id="new-explanation" rows="2" class="w-full px-3 py-2 border border-primary-200 rounded-lg"></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-primary-700 mb-1">例句</label>
        <textarea id="new-example" rows="2" class="w-full px-3 py-2 border border-primary-200 rounded-lg"></textarea>
      </div>
    ` : '';
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 z-50 flex items-center justify-center';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl p-6 max-w-lg w-full mx-4">
        <h3 class="text-xl font-bold mb-4">添加${type === 'word' ? '单词' : type === 'phrase' ? '短语' : '语句'}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">${(this.modules[this.currentModule] && this.modules[this.currentModule].language) || '外语'}原文</label>
            <input type="text" id="new-original" class="w-full px-3 py-2 border border-primary-200 rounded-lg" placeholder="输入${type === 'word' ? '单词' : type === 'phrase' ? '短语' : '语句'}">
          </div>
          <div>
            <label class="block text-sm font-medium text-primary-700 mb-1">中文翻译</label>
            <input type="text" id="new-translation" class="w-full px-3 py-2 border border-primary-200 rounded-lg" placeholder="输入中文翻译">
          </div>
          ${genderField}
          ${explanationField}
        </div>
        <div class="flex gap-3 mt-6">
          <button onclick="this.closest('.fixed').remove()" class="flex-1 px-4 py-2 border border-primary-300 rounded-lg hover:bg-primary-50">取消</button>
          <button onclick="app.saveNewEntry('${type}')" class="flex-1 px-4 py-2 bg-accent-500 text-white rounded-lg hover:bg-accent-600">添加</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },
  
  // 保存新条目
  async saveNewEntry(type) {
    const entry = {
      id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      materialId: 'manual',
      moduleId: this.currentModule,
      type: type,
      original: document.getElementById('new-original').value,
      translation: document.getElementById('new-translation').value,
      srsLevel: 0,
      nextReview: new Date(),
      interval: 0,
      createdAt: new Date()
    };
    
    const explanationEl = document.getElementById('new-explanation');
    if (explanationEl) entry.explanation = explanationEl.value;
    
    const exampleEl = document.getElementById('new-example');
    if (exampleEl) entry.example = exampleEl.value;
    
    const genderEl = document.getElementById('new-gender');
    if (genderEl) entry.gender = genderEl.value;
    
    const wordTypeEl = document.getElementById('new-wordType');
    if (wordTypeEl) entry.wordType = wordTypeEl.value;
    
    if (!entry.original || !entry.translation) {
      alert('请填写原文和翻译');
      return;
    }
    
    await db.entries.put(entry);
    document.querySelector('.fixed.inset-0').remove();
    this.loadEntries();
  },
  
  // SRS Review System
  async startReview() {
    let allEntries = [];
    
    if (this.currentModule) {
      // 获取特定模块待复习的条目
      allEntries = await db.entries.filter(e => 
        e.moduleId === this.currentModule && 
        new Date(e.nextReview) <= new Date()
      ).toArray();
    } else {
      // 获取所有待复习的条目
      allEntries = await db.entries.filter(e => new Date(e.nextReview) <= new Date()).toArray();
    }
    
    // 获取每日复习限制
    const settings = await db.settings.get('dailyLimit');
    const totalLimit = (settings && settings.value) || 20;
    
    if (this.currentModule) {
      // 单个模块复习：按类型分配（单词70%，短语20%，语句10%）
      const words = allEntries.filter(e => e.type === 'word');
      const phrases = allEntries.filter(e => e.type === 'phrase');
      const sentences = allEntries.filter(e => e.type === 'sentence');
      
      const wordLimit = Math.floor(totalLimit * 0.7);
      const phraseLimit = Math.floor(totalLimit * 0.2);
      const sentenceLimit = totalLimit - wordLimit - phraseLimit;
      
      const shuffle = arr => arr.sort(() => 0.5 - Math.random());
      const selectedWords = shuffle([...words]).slice(0, wordLimit);
      const selectedPhrases = shuffle([...phrases]).slice(0, phraseLimit);
      const selectedSentences = shuffle([...sentences]).slice(0, sentenceLimit);
      
      this.reviewQueue = shuffle([
        ...selectedWords,
        ...selectedPhrases,
        ...selectedSentences
      ]);
    } else {
      // 混合复习：按语言平均分配
      const modules = ['german', 'japanese', 'english'];
      const perModuleLimit = Math.floor(totalLimit / modules.length);
      
      const shuffle = arr => arr.sort(() => 0.5 - Math.random());
      let selectedEntries = [];
      
      modules.forEach(moduleId => {
        const moduleEntries = allEntries.filter(e => e.moduleId === moduleId);
        const words = moduleEntries.filter(e => e.type === 'word');
        const phrases = moduleEntries.filter(e => e.type === 'phrase');
        const sentences = moduleEntries.filter(e => e.type === 'sentence');
        
        // 每个语誊内部也按类型分配
        const wordLimit = Math.floor(perModuleLimit * 0.7);
        const phraseLimit = Math.floor(perModuleLimit * 0.2);
        const sentenceLimit = perModuleLimit - wordLimit - phraseLimit;
        
        const selectedWords = shuffle([...words]).slice(0, wordLimit);
        const selectedPhrases = shuffle([...phrases]).slice(0, phraseLimit);
        const selectedSentences = shuffle([...sentences]).slice(0, sentenceLimit);
        
        selectedEntries.push(...selectedWords, ...selectedPhrases, ...selectedSentences);
      });
      
      // 打乱顺序
      this.reviewQueue = shuffle(selectedEntries).slice(0, totalLimit);
    }
    
    this.currentReviewIndex = 0;
    
    console.log(`Review queue: ${this.reviewQueue.length} entries`);
    
    if (this.reviewQueue.length === 0) {
      alert('当前没有需要复习的内容！请先上传学习材料并等待AI处理。');
      return;
    }
    
    this.hideAllViews();
    document.getElementById('review-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = '复习模式';
    this.currentView = 'review';
    
    // 开始计时
    this.startStudyTimer();
    
    this.showCurrentCard();
  },
  
  showCurrentCard() {
    if (this.currentReviewIndex >= this.reviewQueue.length) {
      this.finishReview();
      return;
    }
    
    const entry = this.reviewQueue[this.currentReviewIndex];
    
    // 记录前一个卡片的学习时间（如果有）- 使用秒级精度，最后统一转换为分钟
    if (this.currentCardStartTime && this.currentCardModuleId) {
      const cardDurationSeconds = Math.floor((Date.now() - this.currentCardStartTime) / 1000);
      // 至少学习了 5 秒才记录
      if (cardDurationSeconds >= 5) {
        const cardDurationMinutes = cardDurationSeconds / 60;
        this.moduleStudyTimes[this.currentCardModuleId] = 
          (this.moduleStudyTimes[this.currentCardModuleId] || 0) + cardDurationMinutes;
      }
    }
    
    // 开始记录当前卡片
    this.currentCardStartTime = Date.now();
    this.currentCardModuleId = entry.moduleId;
    
    document.getElementById('review-progress').textContent = `${this.currentReviewIndex + 1}/${this.reviewQueue.length}`;
    
    // 类型标签
    let typeLabel = '';
    if (entry.type === 'word') typeLabel = '📚 单词';
    else if (entry.type === 'phrase') typeLabel = '💬 短语';
    else typeLabel = '📝 语句';
    
    // 词性标签（仅单词）
    let genderLabel = '';
    if (entry.type === 'word' && entry.gender) {
      const genderColor = {
        'm.': 'text-blue-600',
        'f.': 'text-pink-600', 
        'n.': 'text-green-600',
        'pl.': 'text-purple-600'
      }[entry.gender] || 'text-primary-600';
      genderLabel = `<span class="${genderLabel} font-bold text-xl">${entry.gender}</span>`;
    }
    
    document.getElementById('review-context').textContent = `${typeLabel} | SRS Level: ${entry.srsLevel} | 间隔: ${entry.interval}天`;
    
    // 正面显示原文
    document.getElementById('review-question').innerHTML = `
      <div class="flex items-center justify-center gap-3 mb-4">
        ${genderLabel}
        <div class="text-3xl font-bold text-primary-900">${entry.original}</div>
      </div>
    `;
    
    // 背面显示翻译和解释
    let answerHtml = `
      <div class="space-y-4 text-left">
        <div class="p-4 bg-green-50 rounded-lg">
          <div class="text-sm text-green-600 mb-1">翻译</div>
          <div class="text-xl text-green-900">${entry.translation}</div>
        </div>
    `;
    
    if (entry.explanation) {
      answerHtml += `
        <div class="p-4 bg-blue-50 rounded-lg">
          <div class="text-sm text-blue-600 mb-1">用法解释</div>
          <div class="text-primary-800">${entry.explanation}</div>
        </div>
      `;
    }
    
    if (entry.example) {
      answerHtml += `
        <div class="p-4 bg-accent-50 rounded-lg">
          <div class="text-sm text-accent-600 mb-1">例句</div>
          <div class="text-primary-800 italic">${entry.example}</div>
        </div>
      `;
    }
    
    answerHtml += '</div>';
    
    document.getElementById('review-answer').innerHTML = answerHtml;
    document.getElementById('review-answer').classList.add('hidden');
    
    document.getElementById('flip-btn').classList.remove('hidden');
    document.getElementById('rating-controls').classList.add('hidden');
  },
  
  flipCard() {
    document.getElementById('review-answer').classList.remove('hidden');
    document.getElementById('flip-btn').classList.add('hidden');
    document.getElementById('rating-controls').classList.remove('hidden');
  },
  
  async rateCard(rating) {
    const entry = this.reviewQueue[this.currentReviewIndex];
    
    // SM-2 Algorithm
    if (rating >= 3) {
      // Correct
      if (entry.srsLevel === 0) {
        entry.interval = 1;
      } else if (entry.srsLevel === 1) {
        entry.interval = 3;
      } else {
        entry.interval = Math.round(entry.interval * (rating === 4 ? 1.5 : 1.3));
      }
      entry.srsLevel = Math.min(entry.srsLevel + 1, this.srsIntervals.length - 1);
    } else {
      // Wrong - reset
      entry.srsLevel = 0;
      entry.interval = 1;
    }
    
    // Calculate next review date
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + entry.interval);
    entry.nextReview = nextReview;
    
    await db.entries.update(entry.id, {
      srsLevel: entry.srsLevel,
      interval: entry.interval,
      nextReview: entry.nextReview
    });
    
    this.currentReviewIndex++;
    this.showCurrentCard();
  },
  
  async finishReview() {
    // 记录当前正在复习的卡片时间
    if (this.currentCardStartTime && this.currentCardModuleId) {
      const cardDurationSeconds = Math.floor((Date.now() - this.currentCardStartTime) / 1000);
      if (cardDurationSeconds >= 5) {
        const cardDurationMinutes = cardDurationSeconds / 60;
        this.moduleStudyTimes[this.currentCardModuleId] = 
          (this.moduleStudyTimes[this.currentCardModuleId] || 0) + cardDurationMinutes;
      }
    }
    
    // 停止计时并获取实际学习时长
    const duration = this.stopStudyTimer();
    
    if (duration > 0) {
      if (this.currentModule) {
        // 单个模块复习：记录到当前模块
        await this.recordActivity('review', duration);
      } else {
        // 混合复习：按实际学习时间分配到各语言
        const date = new Date().toISOString().split('T')[0];
        const moduleTimes = this.moduleStudyTimes || {};
        
        // 为每个模块记录实际学习时间（转换为整数分钟）
        for (const [moduleId, moduleDuration] of Object.entries(moduleTimes)) {
          const durationMinutes = Math.round(moduleDuration);
          if (durationMinutes > 0) {
            await db.records.put({
              id: `record_${Date.now()}_${moduleId}`,
              date: date,
              moduleId: moduleId,
              duration: durationMinutes,
              action: 'review',
              createdAt: new Date()
            });
          }
        }
        
        await this.updateSidebarStats();
      }
    }
    
    // 重置卡片计时
    this.currentCardStartTime = null;
    this.currentCardModuleId = null;
    this.moduleStudyTimes = {};
    
    alert(`恭喜完成 ${this.reviewQueue.length} 个学习条目的复习！本次学习时长：${duration}分钟`);
    this.loadDashboard();
  },
  
  exitReview() {
    if (confirm('确定要退出复习吗？进度将不会保存。')) {
      this.stopStudyTimer(); // 停止计时（不保存）
      this.loadDashboard();
    }
  },
  
  // Test Generation with AI
  showTestModal() {
    document.getElementById('test-modal').classList.remove('hidden');
    this.updateTestTotalCount();
  },
  
  closeTestModal() {
    document.getElementById('test-modal').classList.add('hidden');
  },
  
  // Toggle test type enable/disable
  toggleTestType(type) {
    const checkbox = document.getElementById(`test-type-${type}`);
    const countInput = document.getElementById(`test-count-${type}`);
    countInput.disabled = !checkbox.checked;
    countInput.classList.toggle('bg-primary-100', !checkbox.checked);
    this.updateTestTotalCount();
  },
  
  // Update total count display
  updateTestTotalCount() {
    const choiceCount = document.getElementById('test-type-choice').checked ? 
      parseInt(document.getElementById('test-count-choice').value) || 0 : 0;
    const fillCount = document.getElementById('test-type-fill').checked ? 
      parseInt(document.getElementById('test-count-fill').value) || 0 : 0;
    const translationCount = document.getElementById('test-type-translation').checked ? 
      parseInt(document.getElementById('test-count-translation').value) || 0 : 0;
    
    const total = choiceCount + fillCount + translationCount;
    document.getElementById('test-total-count').textContent = `${total}题`;
    return total;
  },
  
  async generateTest() {
    // 获取每种题型的数量
    const typeCounts = {};
    let totalCount = 0;
    
    if (document.getElementById('test-type-choice').checked) {
      typeCounts.choice = parseInt(document.getElementById('test-count-choice').value) || 0;
      totalCount += typeCounts.choice;
    }
    if (document.getElementById('test-type-fill').checked) {
      typeCounts.fill = parseInt(document.getElementById('test-count-fill').value) || 0;
      totalCount += typeCounts.fill;
    }
    if (document.getElementById('test-type-translation').checked) {
      typeCounts.translation = parseInt(document.getElementById('test-count-translation').value) || 0;
      totalCount += typeCounts.translation;
    }
    
    if (totalCount === 0) {
      alert('请至少选择一种题型并设置数量');
      return;
    }
    
    this.closeTestModal();
    
    // 获取学习条目
    let entries = [];
    if (this.currentModule) {
      entries = await db.entries.where('moduleId').equals(this.currentModule).toArray();
    } else {
      entries = await db.entries.toArray();
    }
    
    if (entries.length === 0) {
      alert('当前模块没有学习条目，请先上传材料并等待AI处理。');
      return;
    }
    
    // 从所有条目中随机抽取足够的条目用于生成题目（避免一次用完所有条目）
    const totalQuestionsNeeded = Object.values(typeCounts).reduce((a, b) => a + b, 0);
    const entriesToUse = entries.length > totalQuestionsNeeded * 3 
      ? entries.sort(() => 0.5 - Math.random()).slice(0, totalQuestionsNeeded * 3)
      : entries;
    console.log(`Selected ${entriesToUse.length} entries from ${entries.length} total for generating ${totalQuestionsNeeded} questions`);
    
    // Generate test using AI or fallback to template
    const questions = await this.generateQuestionsFromEntriesByType(entriesToUse, typeCounts);
    
    this.testData = {
      moduleId: this.currentModule,
      questions: questions,
      answers: {},
      score: 0
    };
    
    this.showTest();
  },
  
  async generateQuestionsFromEntriesByType(entries, typeCounts) {
    const settings = await this.getSettings();
    const allQuestions = [];
    
    // 每次从条目中随机抽取（确保各类题型都能用到不同的条目）
    const getRandomEntries = (count) => {
      const shuffled = entries.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, Math.min(count * 2, shuffled.length));
    };
    
    // 生成选择题
    if (typeCounts.choice > 0) {
      const choiceEntries = getRandomEntries(typeCounts.choice);
      const choiceQuestions = await this.generateQuestionsOfType(
        choiceEntries, typeCounts.choice, 'choice', settings, 0
      );
      allQuestions.push(...choiceQuestions);
    }
    
    // 生成填空题（使用新的随机条目）
    if (typeCounts.fill > 0) {
      const fillEntries = getRandomEntries(typeCounts.fill);
      const fillQuestions = await this.generateQuestionsOfType(
        fillEntries, typeCounts.fill, 'fill', settings, 0
      );
      allQuestions.push(...fillQuestions);
    }
    
    // 生成翻译题（使用新的随机条目）
    if (typeCounts.translation > 0) {
      const translationEntries = getRandomEntries(typeCounts.translation);
      const translationQuestions = await this.generateQuestionsOfType(
        translationEntries, typeCounts.translation, 'translation', settings, 0
      );
      allQuestions.push(...translationQuestions);
    }
    
    // 打乱题目顺序
    return allQuestions.sort(() => 0.5 - Math.random());
  },
  
  async generateQuestionsOfType(entries, count, type, settings, startIndex) {
    const selectedEntries = entries.slice(startIndex, startIndex + Math.min(count * 2, entries.length));
    
    if (settings.apiKey) {
      try {
        return await this.callAIForTestByType(selectedEntries, count, type, settings);
      } catch (error) {
        console.warn(`AI generation failed for ${type}:`, error);
      }
    }
    
    // Fallback
    return this.generateFallbackQuestionsByType(selectedEntries, count, type);
  },
  
  // 使用AI基于学习条目生成测试题
  async callAIForTestFromEntries(entries, count, types, settings) {
    const mod = this.modules[this.currentModule];
    // 随机选择条目用于生成题目
    const selectedEntries = entries.sort(() => 0.5 - Math.random()).slice(0, Math.min(count * 2, entries.length));
    
    const prompt = `基于以下${mod.name}学习条目，生成${count}道测试题。

学习条目：
${selectedEntries.map((e, i) => `${i+1}. ${e.original} - ${e.translation}`).join('\n')}

要求：
1. 题型包括：${types.join(', ')}
2. 中翻译、词汇选择、填空等
3. 每题包含答案和详细解析
4. 适合初学者水平

返回JSON格式：
[{
  "type": "choice" | "fill" | "translation",
  "question": "题目内容",
  "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
  "answer": "正确答案",
  "explanation": "解析说明"
}]`;

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: '你是一位专业的语言测试题目编写专家。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    const content_text = data.choices[0].message.content;
    
    const jsonMatch = content_text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Invalid response format');
  },
  
  // 基于条目生成简单测试题（无API时 - 优先使用例句）
  generateFallbackQuestionsFromEntries(entries, count, types) {
    const mod = this.modules[this.currentModule];
    const questions = [];
    const shuffled = entries.sort(() => 0.5 - Math.random());
    
    // 用于生成干扰选项的其他条目
    const getDistractors = (correctEntry, count = 3) => {
      const others = shuffled.filter(e => e.id !== correctEntry.id && e.translation !== correctEntry.translation);
      const selected = others.slice(0, count);
      return selected.map(e => e.translation);
    };
    
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      const entry = shuffled[i];
      const type = types[i % types.length];
      const sourceText = entry.example || entry.original;
      
      if (type === 'choice') {
        // 根据条目类型生成不同的选择题
        let questionText, options, answer;
        
        // 判断条目类型（根据wordType和内容）
        const isNoun = entry.wordType && entry.wordType.toLowerCase().includes('substantiv');
        const isVerb = entry.wordType && (entry.wordType.toLowerCase().includes('verb') || entry.original.match(/^(haben|sein|werden|[a-z]+en)$/));
        const isAdj = entry.wordType && entry.wordType.toLowerCase().includes('adjektiv');
        
        if (isNoun && entry.gender) {
          // 名词题：性别或格的变化
          const genders = { 'm.': 'der', 'f.': 'die', 'n.': 'das', 'pl.': 'die' };
          const correctArticle = genders[entry.gender] || 'die';
          const wrongOptions = Object.values(genders).filter(g => g !== correctArticle);
          
          questionText = entry.example 
            ? `例句: "${entry.example}"\n\n选择正确的定冠词：_____ ${entry.original}`
            : `选择正确的定冠词：_____ ${entry.original}`;
          options = [
            { label: 'A', text: correctArticle, correct: true },
            { label: 'B', text: wrongOptions[0], correct: false },
            { label: 'C', text: wrongOptions[1] || wrongOptions[0], correct: false },
            { label: 'D', text: wrongOptions[2] || wrongOptions[0], correct: false }
          ];
        } else if (isVerb && entry.example) {
          // 动词题：分词或时态变化
          const baseForm = entry.original.split(' ')[0];
          const wrongForms = [
            baseForm.replace(/en$/, 't'),
            baseForm.replace(/en$/, 'st'),
            baseForm + 'e'
          ];
          questionText = `在例句中填入正确的动词形式：\n"${entry.example.replace(baseForm, '_____')}"`;
          options = [
            { label: 'A', text: baseForm, correct: true },
            { label: 'B', text: wrongForms[0], correct: false },
            { label: 'C', text: wrongForms[1], correct: false },
            { label: 'D', text: wrongForms[2], correct: false }
          ];
        } else {
          // 默认：词汇意思选择
          questionText = entry.example 
            ? `例句: "${entry.example}"\n\n"${entry.original}" 的意思是什么？`
            : `"${entry.original}" 的中文意思是什么？`;
          options = [
            { label: 'A', text: entry.translation, correct: true },
            { label: 'B', text: '[近似含义 1]', correct: false },
            { label: 'C', text: '[相关概念]', correct: false },
            { label: 'D', text: '[反义词]', correct: false }
          ];
        }
        
        // 打乱选项顺序
        options.sort(() => 0.5 - Math.random());
        options.forEach((opt, idx) => { opt.label = String.fromCharCode(65 + idx); });
        const correctOption = options.find(o => o.correct);
        
        questions.push({
          type: 'choice',
          question: questionText,
          options: options.map(o => `${o.label}. ${o.text}`),
          answer: correctOption.label,
          explanation: `${entry.original} 的意思是 ${entry.translation}${entry.gender ? `，性别：${entry.gender}` : ''}${entry.example ? '\n例句: ' + entry.example : ''}`
        });
      } else if (type === 'fill') {
        const keyword = entry.original.split(/\s+/)[0];
        let maskedQuestion = sourceText;
        if (entry.example && entry.example.includes(keyword)) {
          maskedQuestion = entry.example.replace(keyword, '_____');
        } else {
          const words = entry.original.split(/\s+/);
          const targetWord = words.find(w => w.length > 2) || words[0] || '';
          maskedQuestion = entry.original.replace(targetWord, '_____');
        }
        // 在句末添加所填词的中文提示
        questions.push({
          type: 'fill',
          question: `填空：${maskedQuestion}（${entry.translation}）`,
          answer: keyword,
          explanation: `正确答案是 "${keyword}" 或 "${entry.original}"，意思是 ${entry.translation}${entry.example ? '\n例句: ' + entry.example : ''}`
        });
      } else {
        // 翻译题：直接给句子中文（翻译成外语）
        questions.push({
          type: 'translation',
          question: `翻译：将下列句子翻译成${mod.name || '外'}语：\n"${entry.translation}"`,
          answer: entry.original,
          explanation: `参考答案: ${entry.original}${entry.example ? '\n例句: ' + entry.example : ''}`
        });
      }
    }
    
    return questions;
  },
  
  // 按类型生成测试题（使用AI）
  async callAIForTestByType(entries, count, type, settings) {
    const mod = this.modules[this.currentModule];
    
    const typeNames = {
      choice: '选择题（四选一）',
      fill: '填空题',
      translation: '翻译题（中译或译中）'
    };
    
    const typePrompts = {
      choice: `生成${count}道选择题。题型可以多样化，不限于翻译选择，包括但不限于：
1. 词汇辨析：在例句中选择正确的词形/变格
2. 语法结构：选择正确的介词搭配或句型
3. 上下文理解：根据例句语境选择合适的表达

重要规则（必须遵守）：
- 四个选项 A/B/C/D 必须互不相同，绝对禁止重复
- 只有且仅有一个正确答案，其他三个干扰项必须在逻辑上错误
- 干扰项要有迷惑性（如：错误的词形变化、近义词混淆、相似拼写），但不能和正确答案相同
- 干扰项必须语法上说得通（符合词性、时态规则），只是语义或搭配错误
- 正确答案字母随机分布
- 如果条目是名词，可以考虑性别变化的题目
- 如果条目是动词，可以考虑时态或分词的题目

禁止的错误示例：
- 选项重复（如 A. apple / B. apple / C. orange）
- 两个正确答案（如 "apple" 和 "the apple" 同时正确）
- 干扰项和题目无关（如题目是水果，干扰项是动词）

良好示例：
- "Sie leidet seit Monaten an _____" (A. Depressionen / B. Depression / C. Depressione / D. Depressiv) → 正确答案：A
- "Er hat viel _____ um die Prüfung" (A. Sorgen / B. Sorge / C. Sorgt / D. Sorg) → 正确答案：A`,
      fill: `生成${count}道填空题。要求：
- 优先使用条目中的例句
- 将关键词替换为_____，在句子结尾用（）标注该词的中文意思
- 例如："Ich habe _____ um meine Gesundheit. (担忧)"
- 正确答案是该外语词本身`,
      translation: `生成${count}道翻译题。要求：
- 给出中文句子，让学生翻译成${mod.name}语
- 题目格式："将下列句子翻译成${mod.name}语：'中文句子'"
- 正确答案是条目的原文或例句`
    };
    
    const prompt = `基于以下${mod.name}学习条目，生成${typeNames[type]}。

重要：条目中的"例句"可以用于生成题目，特别是填空题和翻译题。

学习条目：
${entries.map((e, i) => {
  let text = `${i+1}. ${e.original} - ${e.translation}`;
  if (e.explanation) text += `\n   解释: ${e.explanation}`;
  if (e.example) text += `\n   例句: ${e.example}`;
  return text;
}).join('\n\n')}

要求：
${typePrompts[type]}

返回JSON格式：
[{
  "type": "${type}",
  "question": "题目内容",
  ${type === 'choice' ? '"options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],' : ''}
  "answer": "${type === 'choice' ? 'A' : '正确答案'}",
  "explanation": "解析说明"
}]`;

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: '你是一位专业的语言测试题目编写专家。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: settings.maxTokens || 8000
      })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    const data = await response.json();
    let content_text = data.choices[0].message.content;
    
    // 清理markdown
    content_text = content_text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
    
    // 提取JSON
    const jsonMatch = content_text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const questions = JSON.parse(jsonMatch[0]);
      // 确保每题都有正确的type
      return questions.map(q => ({ ...q, type }));
    }
    throw new Error('Invalid response format');
  },
  
  // 按类型生成测试题（无API时的回退方案）- 优先使用例句
  generateFallbackQuestionsByType(entries, count, type) {
    const questions = [];
    const shuffled = entries.sort(() => 0.5 - Math.random());
    const mod = this.modules[this.currentModule];
    
    // 用于生成干扰选项的其他条目
    const getDistractors = (correctEntry, count = 3) => {
      const others = shuffled.filter(e => e.id !== correctEntry.id && e.translation !== correctEntry.translation);
      const selected = others.slice(0, count);
      return selected.map(e => e.translation);
    };
    
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      const entry = shuffled[i];
      // 优先使用例句作为题目材料
      const sourceText = entry.example || entry.original;
      
      if (type === 'choice') {
        // 获取3个干扰选项
        const distractors = getDistractors(entry, 3);
        while (distractors.length < 3) {
          distractors.push(`[其他含义 ${distractors.length + 1}]`);
        }
        // 打乱选项顺序
        const options = [
          { label: 'A', text: entry.translation, correct: true },
          { label: 'B', text: distractors[0], correct: false },
          { label: 'C', text: distractors[1], correct: false },
          { label: 'D', text: distractors[2], correct: false }
        ].sort(() => 0.5 - Math.random());
        options.forEach((opt, idx) => { opt.label = String.fromCharCode(65 + idx); });
        const correctOption = options.find(o => o.correct);
        
        const questionText = entry.example 
          ? `例句: "${entry.example}"\n\n"${entry.original}" 的意思是什么？`
          : `"${entry.original}" 的中文意思是什么？`;
        questions.push({
          type: 'choice',
          question: questionText,
          options: options.map(o => `${o.label}. ${o.text}`),
          answer: correctOption.label,
          explanation: `${entry.original} 的意思是 ${entry.translation}${entry.explanation ? '，' + entry.explanation : ''}${entry.example ? '\n例句: ' + entry.example : ''}`
        });
      } else if (type === 'fill') {
        // 填空题：优先从例句中抽取关键词
        const textToUse = entry.example || entry.original;
        const keyword = entry.original.split(/\s+/)[0];
        let maskedQuestion = textToUse;
        
        // 尝试在例句中替换关键词
        if (entry.example && entry.example.includes(keyword)) {
          maskedQuestion = entry.example.replace(keyword, '_____');
        } else {
          const words = entry.original.split(/\s+/);
          const targetWord = words.find(w => w.length > 2) || words[0] || '';
          maskedQuestion = entry.original.replace(targetWord, '_____');
        }
        
        // 在句末添加中文提示
        questions.push({
          type: 'fill',
          question: `填空：${maskedQuestion}（${entry.translation}）`,
          answer: keyword,
          explanation: `正确答案是 "${keyword}" 或 "${entry.original}"，意思是 ${entry.translation}${entry.example ? '\n例句: ' + entry.example : ''}`
        });
      } else if (type === 'translation') {
        // 翻译题：给中文让用户翻译成外语
        questions.push({
          type: 'translation',
          question: `翻译：将下列句子翻译成${mod?.name || '外'}语：\n"${entry.translation}"`,
          answer: entry.original,
          explanation: `参考答案: ${entry.original}${entry.example ? '\n例句: ' + entry.example : ''}`
        });
      }
    }
    
    return questions;
  },
  
  async callAIForQuestions(materials, count, types, settings) {
    const content = materials.map(m => m.content.substring(0, 1000)).join('\n\n');
    const language = (this.modules[this.currentModule] && this.modules[this.currentModule].language) || 'Unknown';
    
    const prompt = `Based on the following ${language} learning materials, generate ${count} test questions.

Materials:
${content.substring(0, 3000)}

Generate a JSON array of questions with this format:
[{
  "type": "choice" | "fill" | "translation",
  "question": "the question text",
  "options": ["A. option1", "B. option2", "C. option3", "D. option4"], // for choice questions
  "answer": "correct answer",
  "explanation": "detailed explanation"
}]

Requirements:
- Include ${types.join(', ')} question types
- Questions should test understanding of the materials
- Provide detailed explanations for each answer
- IMPORTANT for choice questions:
  - All four options (A, B, C, D) must be DISTINCT and different from each other
  - Only ONE correct answer; distractors must be logically incorrect but grammatically plausible
  - Distractors should be tempting but clearly wrong upon analysis
  - Options should be relevant to the question context
  - Avoid contradictory or nonsensical distractors`;

    const response = await fetch(`${settings.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: 'system', content: 'You are a language learning assistant that generates educational test questions.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content_text = data.choices[0].message.content;
    
    // Extract JSON from response
    const jsonMatch = content_text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Invalid response format');
  },
  
  generateFallbackQuestions(materials, count, types) {
    const questions = [];
    const sentences = [];
    
    materials.forEach(m => {
      const sents = this.extractSentences(m.content);
      sentences.push(...sents);
    });
    
    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i];
      const type = types[i % types.length];
      
      if (type === 'choice') {
        const words = sentence.split(' ').filter(w => w.length > 3);
        const targetWord = words[Math.floor(Math.random() * words.length)] || 'word';
        
        questions.push({
          type: 'choice',
          question: `What is the meaning of "${targetWord}" in this context: "${sentence.substring(0, 100)}..."`,
          options: [
            'A. A type of food',
            'B. An action or verb',
            'C. A descriptive word',
            'D. A place or location'
          ],
          answer: 'B',
          explanation: `In this context, "${targetWord}" is used as a key vocabulary word in the sentence. Further study of the material would help understand its specific meaning.`
        });
      } else if (type === 'fill') {
        const words = sentence.split(' ');
        const targetIndex = Math.floor(Math.random() * words.length);
        const targetWord = words[targetIndex];
        words[targetIndex] = '_____';
        
        questions.push({
          type: 'fill',
          question: `Fill in the blank: "${words.join(' ').substring(0, 150)}"`,
          answer: targetWord,
          explanation: `The correct word is "${targetWord}". This word is essential for understanding the complete meaning of the sentence.`
        });
      } else {
        questions.push({
          type: 'translation',
          question: `Translate the following sentence into your native language:\n"${sentence.substring(0, 150)}"`,
          answer: '[Translation would depend on target language]',
          explanation: `This sentence uses vocabulary and grammar from the learning material. Break it down into smaller parts to understand each component.`
        });
      }
    }
    
    return questions;
  },
  
  showTest() {
    this.hideAllViews();
    document.getElementById('test-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = '测试中';
    this.currentView = 'test';
    
    // 开始计时
    this.startStudyTimer();
    
    const container = document.getElementById('test-container');
    container.innerHTML = `
      <div class="mb-4 flex items-center justify-between">
        <span class="text-primary-500">题目 <span id="test-current">1</span> / ${this.testData.questions.length}</span>
        <button onclick="app.submitTest()" class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg transition-colors">
          提交测试
        </button>
      </div>
    `;
    
    this.testData.questions.forEach((q, idx) => {
      const questionEl = document.createElement('div');
      questionEl.className = 'bg-white rounded-xl shadow-lg p-6 mb-4 border border-primary-100';
      questionEl.id = `question-${idx}`;
      
      let optionsHtml = '';
      if (q.type === 'choice') {
        optionsHtml = `
          <div class="space-y-2 mt-4">
            ${q.options.map((opt, optIdx) => `
              <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-primary-50 cursor-pointer transition-colors">
                <input type="radio" name="q${idx}" value="${opt[0]}" class="w-4 h-4 text-accent-500">
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        `;
      } else if (q.type === 'fill') {
        optionsHtml = `
          <div class="mt-4">
            <input type="text" name="q${idx}" placeholder="输入答案..." class="w-full px-4 py-2 border border-primary-200 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent">
          </div>
        `;
      } else {
        optionsHtml = `
          <div class="mt-4">
            <textarea name="q${idx}" rows="3" placeholder="输入翻译..." class="w-full px-4 py-2 border border-primary-200 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-transparent"></textarea>
          </div>
        `;
      }
      
      questionEl.innerHTML = `
        <div class="flex items-start gap-4">
          <span class="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-bold">${idx + 1}</span>
          <div class="flex-1">
            <p class="font-medium text-lg">${q.question}</p>
            ${optionsHtml}
          </div>
        </div>
      `;
      
      container.appendChild(questionEl);
    });
  },
  
  async submitTest() {
    let correct = 0;
    let scorableCount = 0; // 参与计分的题目数
    const results = [];
    
    this.testData.questions.forEach((q, idx) => {
      const input = document.querySelector(`[name="q${idx}"]`);
      const userAnswer = input ? (input.type === 'radio' ? 
        (document.querySelector(`[name="q${idx}"]:checked`) && document.querySelector(`[name="q${idx}"]:checked`).value) : 
        input.value
      ) : '';
      
      // 保存用户答案
      this.testData.answers[idx] = userAnswer;
      
      // 翻译题不参与自动判分
      let isCorrect = false;
      if (q.type === 'translation') {
        isCorrect = false; // 翻译题默认不计分，由用户自行评估
      } else {
        isCorrect = q.type === 'choice' ? 
          userAnswer === q.answer[0] : 
          userAnswer.toLowerCase().trim() === q.answer.toLowerCase().trim();
        if (isCorrect) correct++;
        scorableCount++;
      }
      
      results.push({
        question: q,
        userAnswer,
        isCorrect: q.type === 'translation' ? null : isCorrect // null 表示未评分
      });
      
      // Show feedback
      const questionEl = document.getElementById(`question-${idx}`);
      if (q.type === 'translation') {
        // 翻译题显示用户答案和参考答案
        questionEl.innerHTML += `
          <div class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div class="font-medium text-blue-600 mb-2">📝 您的答案</div>
            <div class="text-primary-700 mb-3 p-2 bg-white rounded">${userAnswer || '（未作答）'}</div>
            <div class="font-medium text-blue-600 mb-1">📖 参考答案</div>
            <div class="text-primary-700">${q.answer}</div>
            <div class="text-sm text-primary-500 mt-2">翻译题由您自行评估</div>
          </div>
        `;
      } else if (isCorrect) {
        questionEl.classList.add('border-green-300', 'bg-green-50');
      } else {
        // 错误题目显示用户答案和正确答案
        questionEl.classList.add('border-red-300', 'bg-red-50');
        questionEl.innerHTML += `
          <div class="mt-4 p-4 bg-white rounded-lg">
            <div class="font-medium text-red-600 mb-1">❌ 您的答案: ${userAnswer || '（未作答）'}</div>
            <div class="font-medium text-green-600 mb-1">✅ 正确答案: ${q.answer}</div>
            <div class="text-primary-600 mt-2">${q.explanation}</div>
          </div>
        `;
      }
    });
    
    // 隐藏提交按钮，显示退出按钮
    const submitBtn = document.querySelector('#test-view button[onclick="app.submitTest()"]');
    if (submitBtn) {
      submitBtn.outerHTML = `
        <button onclick="app.exitTest()" class="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors">
          退出测试
        </button>
      `;
    }
    
    // 计算分数（只计算客观题）
    const score = scorableCount > 0 ? Math.round((correct / scorableCount) * 100) : 0;
    this.testData.score = score;
    
    // 停止计时并获取实际学习时长
    const duration = this.stopStudyTimer();
    
    // Save test record with full user answers
    await db.tests.put({
      id: `test_${Date.now()}`,
      moduleId: this.currentModule,
      questions: this.testData.questions,
      answers: this.testData.answers,
      results: results,
      score: score,
      duration: duration > 0 ? duration : this.testData.questions.length * 2,
      createdAt: new Date()
    });
    
    // 记录学习时长
    if (duration > 0) {
      await this.recordActivity('test', duration);
    }
    
    // Show result modal
    const translationCount = this.testData.questions.filter(q => q.type === 'translation').length;
    document.getElementById('test-result-score').textContent = `${score}%`;
    document.getElementById('test-result-total').textContent = this.testData.questions.length;
    document.getElementById('test-result-correct').textContent = correct;
    document.getElementById('test-result-wrong').textContent = scorableCount - correct;
    
    // 如果有翻译题，显示提示
    if (translationCount > 0) {
      const existingExtra = document.getElementById('test-result-modal').querySelector('.translation-note');
      if (!existingExtra) {
        document.getElementById('test-result-modal').querySelector('.space-y-2').innerHTML += `
          <div class="translation-note text-sm text-blue-600 text-center mt-2">
            含 ${translationCount} 道翻译题（不计入分数）
          </div>
        `;
      }
    }
    
    document.getElementById('test-result-modal').classList.remove('hidden');
    
    this.recordActivity('test', this.testData.questions.length * 2);
  },
  
  closeTestResult() {
    document.getElementById('test-result-modal').classList.add('hidden');
  },
  
  // 退出测试
  exitTest() {
    if (confirm('确定要退出测试吗？')) {
      this.stopStudyTimer(); // 停止计时（不保存）
      this.loadDashboard();
    }
  },
  
  // Test History
  async showTestHistory() {
    const container = document.getElementById('test-history-list');
    const tests = await db.tests.orderBy('createdAt').reverse().toArray();
    
    if (tests.length === 0) {
      container.innerHTML = '<p class="text-center text-primary-500 py-8">暂无测试记录</p>';
    } else {
      container.innerHTML = tests.map(t => `
        <div class="p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors cursor-pointer" onclick="app.showTestReview('${t.id}')">
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium">${(this.modules[t.moduleId] && this.modules[t.moduleId].name) || '未知模块'}</div>
              <div class="text-sm text-primary-500">${new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold ${t.score >= 80 ? 'text-green-600' : t.score >= 60 ? 'text-yellow-600' : 'text-red-600'}">${t.score}%</div>
              <div class="text-xs text-primary-500">${t.questions ? t.questions.length : 0} 题</div>
            </div>
          </div>
        </div>
      `).join('');
    }
    
    document.getElementById('test-history-modal').classList.remove('hidden');
  },
  
  closeTestHistory() {
    document.getElementById('test-history-modal').classList.add('hidden');
  },
  
  async showTestReview(testId) {
    const test = await db.tests.get(testId);
    if (!test) {
      alert('测试记录不存在');
      return;
    }
    
    document.getElementById('review-score').textContent = `${test.score}%`;
    
    const container = document.getElementById('test-review-content');
    if (!test.results || test.results.length === 0) {
      container.innerHTML = '<p class="text-center text-primary-500">该测试没有保存详细答卷信息</p>';
    } else {
      container.innerHTML = test.results.map((r, idx) => {
        // 判断题型和状态
        const isTranslation = r.question.type === 'translation';
        const isCorrect = r.isCorrect === true;
        const isWrong = r.isCorrect === false;
        
        // 根据状态设置样式
        let borderClass = 'border-primary-200 bg-white';
        if (isCorrect) borderClass = 'border-green-200 bg-green-50';
        else if (isWrong) borderClass = 'border-red-200 bg-red-50';
        else if (isTranslation) borderClass = 'border-blue-200 bg-blue-50';
        
        return `
        <div class="p-4 border rounded-lg ${borderClass}">
          <div class="font-medium mb-2">
            <span class="text-primary-500">${idx + 1}.</span>
            ${r.question.question}
            ${isTranslation ? '<span class="text-xs text-blue-500 ml-2">(翻译题)</span>' : ''}
          </div>
          
          ${r.question.options ? `
            <div class="space-y-1 mb-2 ml-4">
              ${r.question.options.map(opt => {
                const isCorrectOpt = opt.startsWith(r.question.answer);
                const isUserOpt = opt.startsWith(r.userAnswer);
                let optClass = 'text-primary-700';
                if (isCorrectOpt) optClass = 'text-green-600 font-medium';
                else if (isUserOpt && isWrong) optClass = 'text-red-600';
                
                return `
                  <div class="text-sm ${optClass}">
                    ${opt} 
                    ${isCorrectOpt ? '✅' : ''} 
                    ${isUserOpt && isWrong ? '❌ (你选了这个)' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="text-sm ml-4 space-y-1">
              <div class="${isTranslation ? 'text-blue-600' : 'text-green-600'}">
                参考答案: ${r.question.answer}
              </div>
              <div class="${isWrong ? 'text-red-600' : 'text-primary-700'}">
                你的答案: ${r.userAnswer || '未作答'}
              </div>
            </div>
          `}
          
          <div class="text-sm text-primary-600 mt-2 ml-4">
            <span class="font-medium">解析:</span> ${r.question.explanation}
          </div>
        </div>
      `}).join('');
    }
    
    document.getElementById('test-review-modal').classList.remove('hidden');
  },
  
  closeTestReview() {
    document.getElementById('test-review-modal').classList.add('hidden');
  },
  
  // Calendar
  async showCalendar() {
    this.hideAllViews();
    document.getElementById('calendar-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = '学习日历';
    this.currentView = 'calendar';
    
    // Initialize FullCalendar
    if (!this.calendar) {
      this.calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
        initialView: 'dayGridMonth',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek'
        },
        events: await this.getCalendarEvents(),
        eventClick: (info) => {
          alert(info.event.title);
        }
      });
      this.calendar.render();
    } else {
      this.calendar.removeAllEvents();
      this.calendar.addEventSource(await this.getCalendarEvents());
    }
    
    // Load study log
    await this.loadStudyLog();
  },
  
  async getCalendarEvents() {
    const records = await db.records.toArray();
    const dateMap = {};
    
    records.forEach(r => {
      const date = new Date(r.createdAt).toISOString().split('T')[0];
      if (!dateMap[date]) {
        dateMap[date] = { duration: 0, actions: new Set() };
      }
      dateMap[date].duration += r.duration;
      dateMap[date].actions.add(r.action);
    });
    
    return Object.entries(dateMap).map(([date, data]) => ({
      title: `${data.duration}分钟`,
      start: date,
      backgroundColor: data.duration > 30 ? '#10b981' : '#f59e0b',
      borderColor: data.duration > 30 ? '#059669' : '#d97706'
    }));
  },
  
  async loadStudyLog() {
    const records = await db.records.orderBy('createdAt').reverse().limit(20).toArray();
    const container = document.getElementById('study-log');
    
    if (records.length === 0) {
      container.innerHTML = '<p class="text-primary-500 text-center py-4">暂无记录</p>';
      return;
    }
    
    container.innerHTML = records.map(r => `
      <div class="flex items-center justify-between py-2 border-b border-primary-100 last:border-0">
        <div class="flex items-center gap-3">
          <span class="text-lg">${this.getActionIcon(r.action)}</span>
          <div>
            <div class="font-medium">${this.getActionText(r.action)}</div>
            <div class="text-xs text-primary-500">${this.modules[r.moduleId]?.name || '通用'}</div>
          </div>
        </div>
        <div class="text-right text-sm">
          <div class="text-primary-900 font-medium">${r.duration}分钟</div>
          <div class="text-primary-500">${new Date(r.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
    `).join('');
  },
  
  // Statistics
  async showStats() {
    this.hideAllViews();
    document.getElementById('stats-view').classList.remove('hidden');
    document.getElementById('page-title').textContent = '数据统计';
    this.currentView = 'stats';
    
    // Calculate stats
    const records = await db.records.toArray();
    const entries = await db.entries.toArray();
    const tests = await db.tests.toArray();
    
    // Total time
    const totalMinutes = records.reduce((sum, r) => sum + r.duration, 0);
    document.getElementById('stat-total-time').textContent = `${Math.round(totalMinutes / 60 * 10) / 10}小时`;
    
    // Total days (unique dates with activity)
    const uniqueDates = new Set(records.map(r => new Date(r.createdAt).toDateString()));
    document.getElementById('stat-total-days').textContent = `${uniqueDates.size}天`;
    
    // Total entries
    document.getElementById('stat-total-entries').textContent = entries.length;
    
    // Average test score
    const avgScore = tests.length > 0 ? 
      Math.round(tests.reduce((sum, t) => sum + t.score, 0) / tests.length) : 0;
    document.getElementById('stat-avg-score').textContent = `${avgScore}%`;
    
    // Populate module selects
    await this.populateModuleSelects();
    
    // Render charts
    await this.renderCharts(records, tests);
  },
  
  // Populate module dropdowns
  async populateModuleSelects() {
    const modules = await db.modules.toArray();
    const moduleOptions = modules.map(m => 
      `<option value="${m.id}">${m.name}</option>`
    ).join('');
    
    const selects = ['trend-module-select', 'test-score-module-select', 'review-count-module-select'];
    selects.forEach(id => {
      const select = document.getElementById(id);
      if (select) {
        select.innerHTML = '<option value="all">全部模块</option>' + moduleOptions;
      }
    });
  },
  
  async renderCharts(records, tests) {
    // Initialize with default views
    await this.updateTrendChart();
    await this.updateModuleDistributionChart(records);
    await this.updateTestScoreChart();
    await this.updateReviewProgressChart();
  },
  
  // Get filtered records by module
  getFilteredRecords(records, moduleId) {
    if (moduleId === 'all' || !moduleId) return records;
    return records.filter(r => r.moduleId === moduleId);
  },
  
  // Get filtered tests by module
  getFilteredTests(tests, moduleId) {
    if (moduleId === 'all' || !moduleId) return tests;
    return tests.filter(t => t.moduleId === moduleId);
  },
  
  // Update Study Trend Chart
  async updateTrendChart() {
    const moduleId = document.getElementById('trend-module-select')?.value || 'all';
    const viewType = document.getElementById('trend-view-select')?.value || 'week';
    
    const records = await db.records.toArray();
    const filteredRecords = this.getFilteredRecords(records, moduleId);
    
    let labels, data, labelFormat;
    
    if (viewType === 'week') {
      // Last 7 days
      labels = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });
      labelFormat = d => `${d.getMonth() + 1}/${d.getDate()}`;
    } else if (viewType === 'weeks') {
      // Last 8 weeks
      labels = Array.from({ length: 8 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (7 * (7 - i)));
        return d;
      });
      labelFormat = d => `${d.getMonth() + 1}/${d.getDate()}`;
    } else {
      // Last 12 months
      labels = Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (11 - i));
        return d;
      });
      labelFormat = d => `${d.getFullYear()}/${d.getMonth() + 1}`;
    }
    
    const dailyMinutes = {};
    filteredRecords.forEach(r => {
      const date = new Date(r.createdAt);
      let key;
      if (viewType === 'months') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (viewType === 'weeks') {
        // Group by week
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = date.toISOString().split('T')[0];
      }
      dailyMinutes[key] = (dailyMinutes[key] || 0) + r.duration;
    });
    
    data = labels.map(d => {
      let key;
      if (viewType === 'months') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (viewType === 'weeks') {
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = d.toISOString().split('T')[0];
      }
      return dailyMinutes[key] || 0;
    });
    
    const trendCtx = document.getElementById('study-trend-chart').getContext('2d');
    if (this.charts.trend) this.charts.trend.destroy();
    
    this.charts.trend = new Chart(trendCtx, {
      type: viewType === 'week' ? 'line' : 'bar',
      data: {
        labels: labels.map(labelFormat),
        datasets: [{
          label: '学习时长（分钟）',
          data: data,
          borderColor: '#f59e0b',
          backgroundColor: viewType === 'week' ? 'rgba(245, 158, 11, 0.1)' : '#f59e0b',
          fill: viewType === 'week',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `学习时长: ${context.raw} 分钟`
            }
          }
        },
        scales: { 
          y: { 
            beginAtZero: true,
            title: {
              display: true,
              text: '学习时长（分钟）'
            }
          }
        }
      }
    });
  },
  
  // Update Module Distribution Chart (doughnut with percentages)
  async updateModuleDistributionChart(records) {
    const moduleMinutes = {};
    records.forEach(r => {
      const mod = r.moduleId || 'german';
      moduleMinutes[mod] = (moduleMinutes[mod] || 0) + r.duration;
    });
    
    const labels = Object.keys(moduleMinutes).map(k => (this.modules[k] && this.modules[k].name) || k);
    const data = Object.values(moduleMinutes);
    const total = data.reduce((sum, v) => sum + v, 0);
    
    // Generate distinct colors
    const colors = ['#f59e0b', '#10b981', '#486581', '#8b5cf6', '#ec4899', '#14b8a6'];
    
    const distCtx = document.getElementById('module-distribution-chart').getContext('2d');
    if (this.charts.dist) this.charts.dist.destroy();
    this.charts.dist = new Chart(distCtx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, data.length)
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { 
            position: 'bottom',
            labels: {
              generateLabels: (chart) => {
                const data = chart.data;
                return data.labels.map((label, i) => ({
                  text: `${label} (${((data.datasets[0].data[i] / total) * 100).toFixed(1)}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  hidden: false,
                  index: i
                }));
              }
            }
          },
          tooltip: {
            callbacks: {
              label: context => {
                const value = context.raw;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ${value}分钟 (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  },
  
  // Update Test Score Chart
  async updateTestScoreChart() {
    const moduleId = document.getElementById('test-score-module-select')?.value || 'all';
    
    const tests = await db.tests.orderBy('createdAt').toArray();
    const filteredTests = this.getFilteredTests(tests, moduleId);
    
    // Group by date and add sequence number for same day
    const testGroups = {};
    filteredTests.forEach(t => {
      const date = new Date(t.createdAt).toISOString().split('T')[0];
      if (!testGroups[date]) testGroups[date] = [];
      testGroups[date].push(t);
    });
    
    // Build labels and data
    const labels = [];
    const data = [];
    const backgroundColors = [];
    
    Object.keys(testGroups).sort().forEach(date => {
      testGroups[date].forEach((t, idx) => {
        const displayDate = date.slice(5); // MM-DD
        labels.push(`${displayDate}${testGroups[date].length > 1 ? `(${idx + 1})` : ''}`);
        data.push(t.score);
        backgroundColors.push(t.score >= 80 ? '#10b981' : t.score >= 60 ? '#f59e0b' : '#ef4444');
      });
    });
    
    // Show last 15 tests max
    const displayCount = Math.min(15, labels.length);
    const displayLabels = labels.slice(-displayCount);
    const displayData = data.slice(-displayCount);
    const displayColors = backgroundColors.slice(-displayCount);
    
    const testCtx = document.getElementById('test-score-chart').getContext('2d');
    if (this.charts.test) this.charts.test.destroy();
    this.charts.test = new Chart(testCtx, {
      type: 'bar',
      data: {
        labels: displayLabels,
        datasets: [{
          label: '得分',
          data: displayData,
          backgroundColor: displayColors
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `得分: ${context.raw}%`
            }
          }
        },
        scales: { 
          y: { 
            min: 0, 
            max: 100,
            title: {
              display: true,
              text: '得分 (%)'
            }
          }
        }
      }
    });
  },
  
  // Update Learning Progress Chart - 显示各语言已复习条目占总条目的百分比
  async updateReviewProgressChart() {
    // 获取各模块的学习进度
    const progressData = [];
    const labels = [];
    const colors = ['#f59e0b', '#10b981', '#486581', '#8b5cf6', '#ec4899'];
    
    for (const [key, mod] of Object.entries(this.modules)) {
      const entries = await db.entries.where('moduleId').equals(key).toArray();
      const totalEntries = entries.length;
      const reviewedEntries = entries.filter(e => e.srsLevel > 0).length;
      const percentage = totalEntries > 0 ? Math.round((reviewedEntries / totalEntries) * 100) : 0;
      
      labels.push(mod.name);
      progressData.push(percentage);
    }
    
    const reviewCtx = document.getElementById('review-progress-chart').getContext('2d');
    if (this.charts.reviewProgress) this.charts.reviewProgress.destroy();
    this.charts.reviewProgress = new Chart(reviewCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '学习进度',
          data: progressData,
          backgroundColor: colors.slice(0, labels.length),
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => {
                const moduleName = context.label;
                const percentage = context.raw;
                return `${moduleName}: ${percentage}% 已复习`;
              }
            }
          }
        },
        scales: { 
          y: { 
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: '已复习条目占比 (%)'
            },
            ticks: {
              callback: value => value + '%'
            }
          }
        }
      }
    });
  },
  
  // Settings
  async showSettings() {
    const settings = await this.getSettings();
    document.getElementById('setting-api-url').value = settings.apiUrl;
    document.getElementById('setting-api-key').value = settings.apiKey || '';
    document.getElementById('setting-model').value = settings.model;
    document.getElementById('setting-max-tokens').value = settings.maxTokens;
    document.getElementById('setting-daily-limit').value = settings.dailyLimit;
    document.getElementById('setting-proxy-url').value = settings.proxyUrl;
    document.getElementById('settings-modal').classList.remove('hidden');
  },
  
  closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
  },
  
  async saveSettings() {
    await db.settings.put({ id: 'apiUrl', value: document.getElementById('setting-api-url').value });
    await db.settings.put({ id: 'apiKey', value: document.getElementById('setting-api-key').value });
    await db.settings.put({ id: 'model', value: document.getElementById('setting-model').value });
    await db.settings.put({ id: 'maxTokens', value: parseInt(document.getElementById('setting-max-tokens').value) || 8000 });
    await db.settings.put({ id: 'dailyLimit', value: parseInt(document.getElementById('setting-daily-limit').value) || 20 });
    await db.settings.put({ id: 'proxyUrl', value: document.getElementById('setting-proxy-url').value.trim() || 'https://polylingo-proxy.vercel.app' });
    
    this.closeSettings();
    alert('设置已保存');
  },
  
  async getSettings() {
    const [apiUrl, apiKey, model, maxTokens, dailyLimit, proxyUrl] = await Promise.all([
      db.settings.get('apiUrl'),
      db.settings.get('apiKey'),
      db.settings.get('model'),
      db.settings.get('maxTokens'),
      db.settings.get('dailyLimit'),
      db.settings.get('proxyUrl')
    ]);
    
    // 移除apiUrl末尾的斜杠，避免双斜杠问题
    let apiUrlValue = (apiUrl && apiUrl.value) || 'https://api.openai.com/v1';
    apiUrlValue = apiUrlValue.replace(/\/$/, '');
    
    return {
      apiUrl: apiUrlValue,
      apiKey: (apiKey && apiKey.value) || '',
      model: (model && model.value) || 'gpt-3.5-turbo',
      maxTokens: (maxTokens && maxTokens.value) || 8000,
      dailyLimit: (dailyLimit && dailyLimit.value) || 20,
      proxyUrl: (proxyUrl && proxyUrl.value) || 'https://polylingo-proxy.vercel.app'
    };
  },
  
  // Data Export/Import
  async exportData() {
    const data = {
      modules: await db.modules.toArray(),
      materials: await db.materials.toArray(),
      cards: await db.cards.toArray(),
      tests: await db.tests.toArray(),
      records: await db.records.toArray(),
      settings: await db.settings.toArray(),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polylingo_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  
  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (confirm('导入数据将覆盖现有数据，确定继续吗？')) {
        await db.modules.clear();
        await db.materials.clear();
        await db.cards.clear();
        await db.tests.clear();
        await db.records.clear();
        
        if (data.modules) await db.modules.bulkPut(data.modules);
        if (data.materials) await db.materials.bulkPut(data.materials);
        if (data.cards) await db.cards.bulkPut(data.cards);
        if (data.tests) await db.tests.bulkPut(data.tests);
        if (data.records) await db.records.bulkPut(data.records);
        if (data.settings) await db.settings.bulkPut(data.settings);
        
        alert('数据导入成功');
        this.loadDashboard();
      }
    } catch (error) {
      alert('导入失败: ' + error.message);
    }
  },
  
  // Utility Functions
  
  // 开始学习计时
  startStudyTimer() {
    this.studyStartTime = Date.now();
    this.currentStudyMinutes = 0;
    
    // 初始化各语言模块计时
    this.moduleStudyTimes = {};
    this.currentCardStartTime = Date.now();
    
    // 清除之前的计时器
    if (this.studyTimer) {
      clearInterval(this.studyTimer);
    }
    
    // 每分钟更新一次显示
    this.studyTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.studyStartTime) / 60000);
      if (elapsed > this.currentStudyMinutes) {
        this.currentStudyMinutes = elapsed;
        this.updateTodayMinutesDisplay();
      }
    }, 60000); // 每分钟检查一次
    
    console.log('开始学习计时');
  },
  
  // 停止学习计时，返回学习时长（分钟）
  stopStudyTimer() {
    if (this.studyTimer) {
      clearInterval(this.studyTimer);
      this.studyTimer = null;
    }
    
    let duration = 0;
    if (this.studyStartTime) {
      duration = Math.floor((Date.now() - this.studyStartTime) / 60000);
      this.studyStartTime = null;
    }
    
    console.log(`停止学习计时，时长: ${duration}分钟`);
    return duration;
  },
  
  // 实时更新今日学习时长显示
  async updateTodayMinutesDisplay() {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = await db.records.filter(r => 
      new Date(r.createdAt).toISOString().split('T')[0] === today
    ).toArray();
    const recordedMinutes = todayRecords.reduce((sum, r) => sum + r.duration, 0);
    const totalMinutes = recordedMinutes + this.currentStudyMinutes;
    
    const displayEl = document.getElementById('today-minutes');
    if (displayEl) {
      displayEl.textContent = `${totalMinutes}分钟`;
    }
  },
  
  async recordActivity(action, duration) {
    await db.records.put({
      id: `record_${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      moduleId: this.currentModule,
      duration: duration,
      action: action,
      createdAt: new Date()
    });
    
    await this.updateSidebarStats();
  },
  
  async updateSidebarStats() {
    // Today's minutes
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = await db.records.filter(r => 
      new Date(r.createdAt).toISOString().split('T')[0] === today
    ).toArray();
    const todayMinutes = todayRecords.reduce((sum, r) => sum + r.duration, 0);
    document.getElementById('today-minutes').textContent = `${todayMinutes}分钟`;
    
    // Streak calculation
    const streak = await this.calculateStreak();
    document.getElementById('streak-days').textContent = `${streak}天`;
    
    // Module counts - update all including custom
    for (const key in this.modules) {
      const count = await db.entries.where('moduleId').equals(key).count();
      const countEl = document.getElementById(`${key}-count`);
      if (countEl) countEl.textContent = `${count} 条目`;
    }
  },
  
  async calculateStreak() {
    const records = await db.records.toArray();
    const dates = [...new Set(records.map(r => new Date(r.createdAt).toDateString()))]
      .map(d => new Date(d))
      .sort((a, b) => b - a);
    
    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    for (const date of dates) {
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      
      const diffDays = Math.floor((currentDate - checkDate) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0 || (diffDays === 1 && streak === 0)) {
        streak++;
        currentDate = checkDate;
      } else if (diffDays === 1) {
        streak++;
        currentDate = checkDate;
      } else {
        break;
      }
    }
    
    return streak;
  },
  
  async previewMaterial(id) {
    const material = await db.materials.get(id);
    if (material) {
      alert(`预览: ${material.title}\n\n${material.content.substring(0, 500)}...`);
    }
  },
  
  async deleteMaterial(id) {
    if (confirm('确定要删除这个材料吗？相关的学习条目也会被删除。')) {
      await db.materials.delete(id);
      await db.entries.where('materialId').equals(id).delete();
      await this.loadModuleMaterials();
      await this.updateSidebarStats();
    }
  },
  
  // 辅助方法：HTML转义，防止XSS
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  // Custom Module Functions
  showAddModuleModal() {
    document.getElementById('add-module-modal').classList.remove('hidden');
    // Reset form
    document.getElementById('new-module-name').value = '';
    document.getElementById('new-module-lang').value = '';
    document.getElementById('new-module-code').value = '';
    document.getElementById('new-module-flag').value = 'kr';
    
    // Reset prompt inputs
    document.getElementById('new-module-word-prompt').value = '';
    document.getElementById('new-module-phrase-prompt').value = '';
    document.getElementById('new-module-sentence-prompt').value = '';
    document.getElementById('new-module-final-prompt').value = '';
    document.getElementById('new-module-prompt').value = '';
    document.getElementById('prompt-preview-container').classList.add('hidden');
    
    document.querySelectorAll('.module-flag-btn').forEach(btn => {
      btn.classList.remove('ring-2', 'ring-offset-2', 'ring-accent-500');
    });
  },
  
  // 生成Prompt预览
  generatePromptPreview() {
    const wordReq = document.getElementById('new-module-word-prompt').value.trim();
    const phraseReq = document.getElementById('new-module-phrase-prompt').value.trim();
    const sentenceReq = document.getElementById('new-module-sentence-prompt').value.trim();
    const langName = document.getElementById('new-module-name').value.trim() || '该语言';
    
    // 如果都没填，显示默认提示
    if (!wordReq && !phraseReq && !sentenceReq) {
      alert('请至少填写一个类型的提取要求');
      return;
    }
    
    // 生成标准化Prompt
    let prompt = `你是一位专业的${langName}教学专家。请从教材内容中提取学习条目。\n`;
    
    prompt += `\n【系统约束 - 必须严格执行】\n`;
    prompt += `1. 返回格式：合法JSON数组，不要Markdown代码块\n`;
    prompt += `2. 条目类型 type 必须为："word"（单词）/ "phrase"（短语）/ "sentence"（句子）\n`;
    prompt += `3. 必填字段：type、original（原文）、translation（中文翻译）\n`;
    prompt += `4. word类型必须补充：wordType（词性）\n`;
    prompt += `5. explanation字段支持Markdown格式（表格、标题、列表）\n`;
    prompt += `6. example字段可为空（如果例句已在explanation中）\n`;
    prompt += `7. 通用占位符说明（根据语言特点选择使用）：\n`;
    prompt += `   - 基础字段：{{original}}(原文)、{{translation}}(翻译)、{{wordType}}(词性)、{{gender}}(语法性别)、{{pluralForm}}(复数形式)\n`;
    prompt += `   - 音标发音：{{romanization}}(罗马音)、{{IPA}}(国际音标)、{{pronunciation}}(发音要点)\n`;
    prompt += `   - 词源语域：{{wordSource}}(词源分类)、{{etymology}}(词源解释)、{{register}}(语域等级)、{{speechLevel}}(语体等级)\n`;
    prompt += `   - 变化形式：{{conjugation}}(活用变位规则)、{{tenseMood}}(时态语气)\n`;
    prompt += `   - 例句变体：{{exampleFormal}}(正式体)、{{exampleInformal}}(非正式体)、{{exampleWritten}}(书面语)、{{exampleSpoken}}(口语)\n`;
    prompt += `   - 含义解析：{{literalMeaning}}(字面意思)、{{actualMeaning}}(实际含义)、{{nuance}}(语义差别)、{{usageContext}}(使用场景)\n`;
    prompt += `   - 语法成分：{{subject}}(主语)、{{predicate}}(谓语)、{{structure}}(句子结构)、{{tenseMood}}(时态语气)\n`;
    prompt += `   - 文化近义：{{culturalNote}}(文化注释)、{{synonym}}(近义词)、{{antonym}}(反义词)、{{commonMistake}}(常见错误)\n`;
    
    if (wordReq) {
      prompt += `\n【单词（word）提取要求】\n${wordReq}\n`;
      prompt += `\n单词返回格式示例（可根据需要选择占位符组合）：\n`;
      prompt += `{\n`;
      prompt += `  "type": "word",\n`;
      prompt += `  "original": "{{original}}",\n`;
      prompt += `  "translation": "{{translation}}",\n`;
      prompt += `  "wordType": "{{wordType}} {{wordSource}}",\n`;
      prompt += `  "gender": "{{gender}}",\n`;
      prompt += `  "explanation": "## {{original}} ({{translation}})\n\n### 词源与分类\n{{wordSource}} - {{etymology}}\n\n### 语法特征\n{{conjugation}}\n\n### 使用场景\n{{usageContext}}\n\n### 近义词辨析\n| 词汇 | 语域 | 差异 |\n|------|------|------|\n| {{synonym}} | {{register}} | {{nuance}} |",\n`;
      prompt += `  "example": ""\n`;
      prompt += `}\n`;
    }
    
    if (phraseReq) {
      prompt += `\n【短语（phrase）提取要求】\n${phraseReq}\n`;
      prompt += `\n短语返回格式示例（建议使用丰富的Markdown表格）：\n`;
      prompt += `{\n`;
      prompt += `  "type": "phrase",\n`;
      prompt += `  "original": "{{original}}",\n`;
      prompt += `  "translation": "{{translation}}",\n`;
      prompt += `  "wordType": "",\n`;
      prompt += `  "explanation": "## {{original}}\n\n### 结构分解\n{{structure}}\n\n### 字面 vs 实际\n| 层面 | 含义 |\n|------|------|\n| 字面 | {{literalMeaning}} |\n| 实际 | {{actualMeaning}} |\n\n### 语域与语体\n{{register}} / {{speechLevel}}\n\n### 使用场景\n{{usageContext}}\n\n### 近义表达\n| 表达 | 语域 | 例句 |\n|------|------|------|\n| {{synonym}} | {{register}} | {{example}} |",\n`;
      prompt += `  "example": ""\n`;
      prompt += `}\n`;
    }
    
    if (sentenceReq) {
      prompt += `\n【语句（sentence）提取要求】\n${sentenceReq}\n`;
      prompt += `\n语句返回格式示例（建议包含语法分析和语体对比）：\n`;
      prompt += `{\n`;
      prompt += `  "type": "sentence",\n`;
      prompt += `  "original": "{{original}}",\n`;
      prompt += `  "translation": "{{translation}}",\n`;
      prompt += `  "wordType": "",\n`;
      prompt += `  "explanation": "### 🎯 使用场景\n{{usageContext}} ({{tenseMood}})\n\n### 📝 原文\n{{original}}\n\n### 🔤 音标\n{{romanization}} / {{IPA}}\n\n### 🗣️ 发音提示\n{{pronunciation}} / {{liaison}}\n\n### 📑 语法分析\n| 成分 | 说明 |\n|------|------|\n| 主语 | {{subject}} |\n| 谓语 | {{predicate}} |\n| 时态 | {{tenseMood}} |\n| 结构 | {{structure}} |\n\n### 🔄 语体转换\n| 语体 | 表达 | 适用场景 |\n|------|------|----------|\n| 正式体 | {{exampleFormal}} | 正式场合 |\n| 非正式体 | {{exampleInformal}} | 日常交流 |",\n`;
      prompt += `  "example": ""\n`;
      prompt += `}\n`;
    }
    
    prompt += `\n【数量要求】\n每1000字符提取20-40个条目（单词+短语+语句）\n`;
    prompt += `\n【重要提示】\n`;
    prompt += `- 根据内容自动判断条目类型，不要全部返回同一类型\n`;
    prompt += `- 例句可以根据词义自行生成，不一定来源于原文\n`;
    prompt += `- 确保返回的JSON合法，不要有注释\n`;
    
    // 显示预览区
    document.getElementById('new-module-final-prompt').value = prompt.trim();
    document.getElementById('new-module-prompt').value = prompt.trim();
    document.getElementById('prompt-preview-container').classList.remove('hidden');
    
    // 滚动到预览区
    document.getElementById('prompt-preview-container').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  
  // 切换占位符帮助面板显示/隐藏
  togglePlaceholderHelp() {
    const panel = document.getElementById('placeholder-help-panel');
    if (panel) {
      panel.classList.toggle('hidden');
    }
  },
  
  // 插入占位符到Prompt编辑框
  insertPlaceholder(placeholder) {
    const textarea = document.getElementById('new-module-final-prompt');
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    
    textarea.value = before + placeholder + after;
    textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
    textarea.focus();
    
    // 触发input事件更新隐藏字段
    textarea.dispatchEvent(new Event('input'));
    document.getElementById('new-module-prompt').value = textarea.value;
  },
  
  // 复制Prompt到剪贴板
  async copyPromptToClipboard() {
    const textarea = document.getElementById('new-module-final-prompt');
    if (!textarea || !textarea.value.trim()) {
      alert('Prompt为空，请先生成Prompt');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(textarea.value);
      alert('已复制到剪贴板！');
    } catch (err) {
      // 降级方案：选中文本
      textarea.select();
      document.execCommand('copy');
      alert('已复制到剪贴板！');
    }
  },
  
  closeAddModuleModal() {
    document.getElementById('add-module-modal').classList.add('hidden');
  },
  
  selectModuleFlag(flag) {
    document.getElementById('new-module-flag').value = flag;
    document.querySelectorAll('.module-flag-btn').forEach(btn => {
      btn.classList.remove('ring-2', 'ring-offset-2', 'ring-accent-500');
    });
    var flagBtn = document.querySelector(`.module-flag-btn[data-flag="${flag}"]`); if (flagBtn) flagBtn.classList.add('ring-2', 'ring-offset-2', 'ring-accent-500');
  },
  
  async addCustomModule() {
    const name = document.getElementById('new-module-name').value.trim();
    const language = document.getElementById('new-module-lang').value.trim();
    const code = document.getElementById('new-module-code').value.trim().toUpperCase();
    const flag = document.getElementById('new-module-flag').value;
    // 优先使用用户编辑过的最终prompt，如果没有则使用隐藏字段的值
    const finalPrompt = document.getElementById('new-module-final-prompt');
    const customPrompt = finalPrompt && finalPrompt.value.trim() 
      ? finalPrompt.value.trim() 
      : document.getElementById('new-module-prompt').value.trim();
    
    if (!name || !language || !code) {
      alert('请填写所有必填字段');
      return;
    }
    
    const id = `custom_${Date.now()}`;
    
    // Save to database
    await db.modules.put({
      id: id,
      name: name,
      language: language,
      code: code,
      flag: flag,
      customPrompt: customPrompt,
      isDefault: false,
      createdAt: new Date()
    });
    
    // Add to modules object
    this.modules[id] = {
      id: id,
      name: name,
      language: language,
      code: code,
      flag: flag,
      customPrompt: customPrompt,
      isCustom: true
    };
    
    // Render only the new module
    this.renderSingleCustomModule(this.modules[id]);
    this.closeAddModuleModal();
    
    // Refresh dashboard stats
    await this.loadDashboard();
    
    alert(`已添加 ${name} 模块！`);
  },
  
  // Render a single custom module (to avoid re-rendering all)
  renderSingleCustomModule(mod) {
    // 检查是否已存在，防止重复渲染
    if (document.getElementById(`nav-${mod.id}`) || document.getElementById(`card-${mod.id}`)) {
      console.log(`Module ${mod.id} already rendered, skipping...`);
      return;
    }
    
    // Render in sidebar
    const navContainer = document.getElementById('custom-modules-nav');
    if (navContainer) {
      const btn = document.createElement('button');
      btn.id = `nav-${mod.id}`;
      btn.className = 'nav-item w-full px-4 py-3 flex items-center gap-3 hover:bg-primary-800 transition-colors';
      btn.onclick = () => app.switchModule(mod.id);
      btn.innerHTML = `
        <span class="fi fi-${mod.flag || 'un'} w-8 h-6 rounded shadow-sm"></span>
        <div class="text-left">
          <div class="font-medium">${mod.name}</div>
          <div class="text-xs text-primary-400" id="${mod.id}-count">0 语料</div>
        </div>
      `;
      navContainer.appendChild(btn);
    }
    
    // Render in dashboard cards
    const dashboardCards = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3');
    if (dashboardCards) {
      // 再次检查是否已存在
      if (document.getElementById(`card-${mod.id}`)) return;
      
      const card = document.createElement('div');
      card.id = `card-${mod.id}`;
      card.onclick = () => app.switchModule(mod.id);
      card.className = 'module-card bg-white rounded-xl p-6 shadow-lg cursor-pointer border border-primary-100';
      card.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <div class="w-16 h-12 rounded-lg shadow-lg overflow-hidden">
            <span class="fi fi-${mod.flag || 'un'} w-full h-full"></span>
          </div>
          <div class="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
            <span class="text-primary-600 font-bold text-sm" id="${mod.id}-progress">0%</span>
          </div>
        </div>
        <h4 class="text-xl font-bold mb-1">${mod.name}</h4>
        <p class="text-sm text-primary-500 mb-3">${mod.language}</p>
        <div class="flex items-center justify-between text-sm">
          <span class="text-primary-600"><span id="${mod.id}-entries">0</span> 条目</span>
          <span class="text-accent-600"><span id="${mod.id}-due">0</span> 待复习</span>
        </div>
        <div class="mt-4 w-full bg-primary-100 rounded-full h-2">
          <div id="${mod.id}-bar" class="bg-primary-600 h-2 rounded-full transition-all" style="width: 0%"></div>
        </div>
        <button onclick="event.stopPropagation(); app.deleteModule('${mod.id}')" class="mt-3 w-full px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm transition-colors">
          删除模块
        </button>
      `;
      dashboardCards.appendChild(card);
    }
  },
  
  async deleteModule(moduleId) {
    if (!(this.modules[moduleId] && this.modules[moduleId].isCustom)) {
      alert('默认模块不能删除');
      return;
    }
    
    if (confirm(`确定要删除 ${this.modules[moduleId].name} 模块吗？该模块的所有语料和学习记录都会被删除。`)) {
      // Delete related data
      await db.modules.delete(moduleId);
      const materials = await db.materials.where('moduleId').equals(moduleId).toArray();
      for (const m of materials) {
        await db.cards.where('materialId').equals(m.id).delete();
      }
      await db.materials.where('moduleId').equals(moduleId).delete();
      
      // Remove from modules object
      delete this.modules[moduleId];
      
      // Remove from UI
      const navBtn = document.getElementById(`nav-${moduleId}`);
      if (navBtn) navBtn.remove();
      const card = document.getElementById(`card-${moduleId}`);
      if (card) card.remove();
      
      // Refresh
      await this.loadDashboard();
    }
  },
  
  async generateTestFromMaterials() {
    const checkboxes = document.querySelectorAll('.material-checkbox:checked');
    if (checkboxes.length === 0) {
      alert('请先选择要测试的语料');
      return;
    }
    this.showTestModal();
  }
};

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

