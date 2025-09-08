class TodoApp {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('tasks')) || [];
        this.categories = JSON.parse(localStorage.getItem('categories')) || [
            { id: 'work', name: 'Work', icon: 'fas fa-briefcase' },
            { id: 'study', name: 'Study', icon: 'fas fa-graduation-cap' },
            { id: 'personal', name: 'Personal', icon: 'fas fa-user' }
        ];
        this.currentFilter = 'all';
        this.currentCategory = 'all';
        this.currentPriority = null;
        this.currentSort = 'created';
        this.editingTask = null;
        this.searchQuery = '';
        this.progressChart = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTheme();
        this.setupDragAndDrop();
        this.renderCategories();
        this.renderTasks();
        this.updateStats();
        this.setupProgressChart();
        this.setupNotifications();
        this.checkReminders();
    }

    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        // Add tooltip to theme toggle button dynamically for better accessibility
        document.getElementById('themeToggle').setAttribute('aria-label', 'Toggle light/dark theme');

        // Task form
        document.getElementById('taskForm').addEventListener('submit', (e) => this.handleTaskSubmit(e));
        document.getElementById('cancelBtn').addEventListener('click', () => this.cancelEdit());

        // Search and sort (debounced search)
        let searchTimeout;
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.handleSearch(e.target.value);
            }, 300);
        });

        document.getElementById('sortSelect').addEventListener('change', (e) => this.handleSort(e.target.value));

        // Category and filter clicks
        document.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', () => this.filterByCategory(item.dataset.category));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.filterByCategory(item.dataset.category);
                }
            });
        });

        document.querySelectorAll('.filter-item').forEach(item => {
            item.addEventListener('click', () => this.filterByStatus(item.dataset.filter));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.filterByStatus(item.dataset.filter);
                }
            });
        });

        document.querySelectorAll('.priority-item').forEach(item => {
            item.addEventListener('click', () => this.filterByPriority(item.dataset.priority));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.filterByPriority(item.dataset.priority);
                }
            });
        });

        // View toggle
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => this.toggleView(btn.dataset.view));
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.toggleView(btn.dataset.view);
                }
            });
        });

        // Quick actions
        document.getElementById('clearCompletedBtn').addEventListener('click', () => this.clearCompleted());
        document.getElementById('markAllCompleteBtn').addEventListener('click', () => this.markAllComplete());

        // Import/Export
        document.getElementById('importBtn').addEventListener('click', () => this.importTasks());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportTasks());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileImport(e));

        // Modal handling
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('addCategoryBtn').addEventListener('click', () => this.showCategoryModal());
        document.getElementById('categoryModalClose').addEventListener('click', () => this.closeCategoryModal());
        document.getElementById('categoryForm').addEventListener('submit', (e) => this.handleCategorySubmit(e));
        document.getElementById('categoryCancelBtn').addEventListener('click', () => this.closeCategoryModal());

        // Keyboard shortcuts for closing modals with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeCategoryModal();
            }
        });
    }

    // Task Management
    addTask(taskData) {
        const task = {
            id: Date.now().toString(),
            title: this.escapeHtml(taskData.title),
            description: this.escapeHtml(taskData.description || ''),
            category: taskData.category,
            priority: taskData.priority,
            dueDate: taskData.dueDate || null,
            recurring: taskData.recurring || false,
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        this.tasks.unshift(task);
        this.saveTasks();
        this.renderTasks();
        this.updateStats();
        this.showNotification('Task added successfully!', 'success');

        if (task.dueDate) {
            this.scheduleReminder(task);
        }
    }

    editTask(id, taskData) {
        const taskIndex = this.tasks.findIndex(task => task.id === id);
        if (taskIndex !== -1) {
            this.tasks[taskIndex] = { ...this.tasks[taskIndex], ...taskData };
            this.saveTasks();
            this.renderTasks();
            this.updateStats();
            this.showNotification('Task updated successfully!', 'success');
        }
    }

    deleteTask(id) {
        if (confirm('Are you sure you want to delete this task?')) {
            this.tasks = this.tasks.filter(task => task.id !== id);
            this.saveTasks();
            this.renderTasks();
            this.updateStats();
            this.showNotification('Task deleted successfully!', 'success');
        }
    }

    toggleTaskComplete(id) {
        const task = this.tasks.find(task => task.id === id);
        if (task) {
            task.completed = !task.completed;
            task.completedAt = task.completed ? new Date().toISOString() : null;

            if (task.completed && task.recurring) {
                this.createRecurringTask(task);
            }

            this.saveTasks();
            this.renderTasks();
            this.updateStats();
        }
    }

    createRecurringTask(originalTask) {
        const newTask = {
            ...originalTask,
            id: Date.now().toString(),
            completed: false,
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        if (newTask.dueDate) {
            const dueDate = new Date(newTask.dueDate);
            dueDate.setDate(dueDate.getDate() + 7);
            newTask.dueDate = dueDate.toISOString().slice(0, 16);
        }

        this.tasks.unshift(newTask);
        this.saveTasks();
    }

    // Filtering and Sorting
    filterByCategory(category) {
        this.currentCategory = category;
        document.querySelectorAll('.category-item').forEach(item => {
            item.classList.toggle('active', item.dataset.category === category);
        });
        this.renderTasks();
        this.updateSectionTitle();
    }

    filterByStatus(status) {
        this.currentFilter = status;
        document.querySelectorAll('.filter-item').forEach(item => {
            item.classList.toggle('active', item.dataset.filter === status);
        });
        this.renderTasks();
        this.updateSectionTitle();
    }

    filterByPriority(priority) {
        this.currentPriority = this.currentPriority === priority ? null : priority;
        document.querySelectorAll('.priority-item').forEach(item => {
            item.classList.toggle('active', item.dataset.priority === this.currentPriority);
        });
        this.renderTasks();
    }

    handleSearch(query) {
        this.searchQuery = query.toLowerCase();
        this.renderTasks();
    }

    handleSort(sortBy) {
        this.currentSort = sortBy;
        this.renderTasks();
    }

    getFilteredTasks() {
        let filtered = [...this.tasks];

        if (this.currentCategory !== 'all') {
            filtered = filtered.filter(task => task.category === this.currentCategory);
        }

        if (this.currentFilter === 'completed') {
            filtered = filtered.filter(task => task.completed);
        } else if (this.currentFilter === 'pending') {
            filtered = filtered.filter(task => !task.completed);
        } else if (this.currentFilter === 'overdue') {
            const now = new Date();
            filtered = filtered.filter(task => !task.completed && task.dueDate && new Date(task.dueDate) < now);
        }

        if (this.currentPriority) {
            filtered = filtered.filter(task => task.priority === this.currentPriority);
        }

        if (this.searchQuery) {
            filtered = filtered.filter(task =>
                task.title.toLowerCase().includes(this.searchQuery) ||
                task.description.toLowerCase().includes(this.searchQuery)
            );
        }

        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'dueDate':
                    if (!a.dueDate && !b.dueDate) return 0;
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    return new Date(a.dueDate) - new Date(b.dueDate);
                case 'priority':
                    const priorityOrder = { high: 3, medium: 2, low: 1 };
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                case 'title':
                    return a.title.localeCompare(b.title);
                default:
                    return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });

        return filtered;
    }

    // Rendering
    renderTasks() {
        const container = document.getElementById('taskContainer');
        const emptyState = document.getElementById('emptyState');
        const filteredTasks = this.getFilteredTasks();

        if (filteredTasks.length === 0) {
            container.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        container.style.display = 'grid';
        emptyState.style.display = 'none';

        container.innerHTML = filteredTasks.map(task => this.createTaskCard(task)).join('');

        container.querySelectorAll('.task-card').forEach(card => {
            const taskId = card.dataset.taskId;

            card.querySelector('.task-checkbox').addEventListener('change', () => {
                this.toggleTaskComplete(taskId);
            });

            card.querySelector('.task-action-btn.edit').addEventListener('click', () => {
                this.startEditTask(taskId);
            });

            card.querySelector('.task-action-btn.delete').addEventListener('click', () => {
                this.deleteTask(taskId);
            });
        });
    }

    createTaskCard(task) {
        const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;
        const formattedDueDate = task.dueDate ? this.formatDate(new Date(task.dueDate)) : '';
        const category = this.categories.find(cat => cat.id === task.category);

        return `
            <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="task-header">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark task '${task.title}' as complete" />
                    <div class="task-content">
                        <div class="task-title">${task.title}</div>
                        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                        <div class="task-meta">
                            <div class="task-category">
                                <i class="${category?.icon || 'fas fa-tag'}" aria-hidden="true"></i>
                                <span>${category?.name || task.category}</span>
                            </div>
                            <div class="task-priority ${task.priority}">
                                <span class="priority-dot ${task.priority}" aria-hidden="true"></span>
                                <span>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
                            </div>
                            ${task.dueDate ? `<div class="task-due-date ${isOverdue ? 'overdue' : ''}">${formattedDueDate}</div>` : ''}
                            ${task.recurring ? '<div class="task-recurring"><i class="fas fa-repeat" aria-hidden="true"></i> Recurring</div>' : ''}
                        </div>
                        <div class="task-actions">
                            <button class="task-action-btn edit" title="Edit task" aria-label="Edit task '${task.title}'">
                                <i class="fas fa-edit" aria-hidden="true"></i>
                            </button>
                            <button class="task-action-btn delete" title="Delete task" aria-label="Delete task '${task.title}'">
                                <i class="fas fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderCategories() {
        const categoryList = document.querySelector('.category-list');
        const taskCategory = document.getElementById('taskCategory');

        const defaultCategoriesHTML = `
            <div class="category-item active" data-category="all">
                <i class="fas fa-inbox"></i>
                <span>All Tasks</span>
                <span class="task-count" id="allCount">0</span>
            </div>
            <div class="category-item" data-category="work">
                <i class="fas fa-briefcase"></i>
                <span>Work</span>
                <span class="task-count" id="workCount">0</span>
            </div>
            <div class="category-item" data-category="study">
                <i class="fas fa-graduation-cap"></i>
                <span>Study</span>
                <span class="task-count" id="studyCount">0</span>
            </div>
            <div class="category-item" data-category="personal">
                <i class="fas fa-user"></i>
                <span>Personal</span>
                <span class="task-count" id="personalCount">0</span>
            </div>
        `;

        const customCategoriesHTML = this.categories.slice(3).map(cat => `
            <div class="category-item" data-category="${cat.id}">
                <i class="${cat.icon}"></i>
                <span>${cat.name}</span>
                <span class="task-count" id="${cat.id}Count">0</span>
            </div>`).join('');

        categoryList.innerHTML = defaultCategoriesHTML + customCategoriesHTML;

        taskCategory.innerHTML = this.categories.map(cat =>
            `<option value="${cat.id}">${cat.name}</option>`
        ).join('');

        document.querySelectorAll('.category-item').forEach(item => {
            item.addEventListener('click', () => this.filterByCategory(item.dataset.category));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    this.filterByCategory(item.dataset.category);
                }
            });
        });

        this.updateCategoryCounts();
    }

    updateCategoryCounts() {
        const counts = { all: this.tasks.length };
        this.categories.forEach(category => {
            counts[category.id] = this.tasks.filter(task => task.category === category.id).length;
        });

        Object.entries(counts).forEach(([category, count]) => {
            const element = document.getElementById(`${category}Count`);
            if (element) element.textContent = count;
        });
    }

    updateStats() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(task => task.completed).length;
        const pending = total - completed;

        document.getElementById('totalTasks').textContent = total;
        document.getElementById('completedTasks').textContent = completed;
        document.getElementById('pendingTasks').textContent = pending;

        this.updateCategoryCounts();
        this.updateProgressChart();
        this.updateUpcomingDeadlines();
    }

    updateSectionTitle() {
        const titleElement = document.getElementById('sectionTitle') || document.getElementById('tasks-heading');
        let title = 'All Tasks';

        if (this.currentCategory !== 'all') {
            const category = this.categories.find(cat => cat.id === this.currentCategory);
            title = category ? category.name : this.currentCategory;
        }

        if (this.currentFilter !== 'all') {
            title += ` - ${this.currentFilter.charAt(0).toUpperCase() + this.currentFilter.slice(1)}`;
        }

        titleElement.textContent = title;
    }

    // Form Handling
    handleTaskSubmit(e) {
        e.preventDefault();

        const taskData = {
            title: document.getElementById('taskTitle').value.trim(),
            description: document.getElementById('taskDescription').value.trim(),
            category: document.getElementById('taskCategory').value,
            priority: document.getElementById('taskPriority').value,
            dueDate: document.getElementById('taskDueDate').value,
            recurring: document.getElementById('taskRecurring').checked
        };

        if (!taskData.title) {
            this.showNotification('Please enter a task title', 'error');
            return;
        }

        if (this.editingTask) {
            this.editTask(this.editingTask, taskData);
            this.cancelEdit();
        } else {
            this.addTask(taskData);
        }

        e.target.reset();
    }

    startEditTask(id) {
        const task = this.tasks.find(task => task.id === id);
        if (!task) return;

        this.editingTask = id;

        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description;
        document.getElementById('taskCategory').value = task.category;
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskDueDate').value = task.dueDate || '';
        document.getElementById('taskRecurring').checked = task.recurring;

        document.querySelector('.add-task-btn').innerHTML = '<i class="fas fa-save"></i> Update Task';
        document.getElementById('cancelBtn').style.display = 'inline-flex';

        document.getElementById('taskTitle').focus();
        document.querySelector('.task-input-section').scrollIntoView({ behavior: 'smooth' });
    }

    cancelEdit() {
        this.editingTask = null;
        document.getElementById('taskForm').reset();
        document.querySelector('.add-task-btn').innerHTML = '<i class="fas fa-plus"></i> Add Task';
        document.getElementById('cancelBtn').style.display = 'none';
    }

    // Theme Management
    setupTheme() {
        const savedTheme = localStora
