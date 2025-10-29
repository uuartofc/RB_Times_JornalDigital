const supabaseConfig = {
    // ATUALIZE AQUI COM SUAS CHAVES REAIS
    url: 'https://ktasovkzriskdjrtxkpk.supabase.co', 
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0YXNvdmt6cmlza2RqcnR4a3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NjEzNzcsImV4cCI6MjA3NzIzNzM3N30.tkmIYZ0KSWPCYhYEk7139Qvn0BHcE4gWMGNujR6arGw' 
};

const { createClient } = supabase;
const supabaseClient = createClient(supabaseConfig.url, supabaseConfig.key);

let currentPostId = null;

// =========================================================
// 🔑 LÓGICA DE AUTENTICAÇÃO SIMPLIFICADA (COM FIX RLS)
// =========================================================

async function checkAdminPassword(password) {
    const { data, error } = await supabaseClient
        .from('admin_config') 
        .select('secret_key') 
        .eq('id', 1) 
        .single();

    if (error) {
        console.error("Erro ao buscar chave secreta:", error.message);
        return false;
    }

    if (data && data.secret_key === password) {
        // AÇÃO CRÍTICA PARA RLS: Simula o login no Supabase Auth.
        try {
            // Lembre-se que o usuário 'admin@rbtimes.com' DEVE existir no Supabase Auth com esta senha.
            const { error: authError } = await supabaseClient.auth.signInWithPassword({
                email: 'admin@rbtimes.com',
                password: password 
            });

            if (authError) {
                 console.warn("Falha no login de autenticação Supabase (Verifique se o usuário admin@rbtimes.com existe):", authError.message);
            } else {
                 console.log("Simulação de login Supabase bem-sucedida. Token 'authenticated' emitido.");
            }
        } catch (err) {
             console.warn("Erro inesperado no signInWithPassword:", err);
        }

        sessionStorage.setItem('isAdminLoggedIn', 'true');
        return true;
    }
    return false;
}

function checkAuthStatus() {
    return sessionStorage.getItem('isAdminLoggedIn') === 'true';
}

async function handleLogout() {
    sessionStorage.removeItem('isAdminLoggedIn');
    // LIMPEZA CRUCIAL: Faz logout também no Supabase para invalidar o token 'authenticated'
    await supabaseClient.auth.signOut(); 
    window.location.reload();
}

// =========================================================
// 📧 MÓDULO DE SUGESTÕES (ADMIN.HTML) 
// =========================================================

async function loadSuggestions() {
    const listDiv = document.getElementById('suggestionList');
    if (!listDiv) {
        console.error("Elemento #suggestionList não encontrado no DOM.");
        return;
    }
    // Exibe o carregamento
    listDiv.innerHTML = '<p class="loading-message">Carregando sugestões...</p>';
    
    // Tenta obter a sessão atual (incluindo o token 'authenticated')
    await supabaseClient.auth.getSession();


    const { data: sugestoes, error } = await supabaseClient
        .from('sugestoes')
        .select('id, nome, email, ideia, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        // Se a falha for 403 (Permission Denied), é RLS!
        console.error("ERRO AO CARREGAR SUGESTÕES (RLS ou Configuração):", error);
        listDiv.innerHTML = `<p class="error-message">Erro ao carregar sugestões: ${error.message}. Verifique a política RLS da tabela 'sugestoes'.</p>`;
        return;
    }

    // Se não há dados ou a lista está vazia
    if (!sugestoes || sugestoes.length === 0) {
        listDiv.innerHTML = `<p>Nenhuma sugestão enviada.</p>`;
        return;
    }
    
    // Mapeia os dados para uma lista de strings HTML
    const suggestionsHtml = sugestoes.map(s => {
        const date = s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : 'N/A';
        return `
            <div class="suggestion-item">
                <div>
                    <p><strong>${s.nome || 'Anônimo'}</strong> (${s.email || 'N/A'})</p>
                    <p>${s.ideia}</p>
                    <span class="meta">${date}</span>
                </div>
                <button class="delete-suggestion-btn" data-id="${s.id}">Excluir</button>
            </div>
        `;
    }).join('');

    // RENDERIZAÇÃO EXPLÍCITA: Define o innerHTML do container uma única vez.
    listDiv.innerHTML = suggestionsHtml;
}

async function deleteSuggestion(id) {
    if (!confirm('Deseja excluir esta sugestão?')) return;
    
    // O cliente Supabase agora DEVE ter o token 'authenticated'
    const { error } = await supabaseClient
        .from('sugestoes')
        .delete()
        .eq('id', id);

    if (error) {
        // Se houver erro aqui, é 99% RLS!
        alert('Erro ao excluir sugestão (Verifique RLS e se o login simulado funcionou!): ' + error.message);
        console.error("Falha ao deletar sugestão (Provavelmente RLS no DELETE):", error);
    } else {
        loadSuggestions();
    }
}

// =========================================================
// ⚙️ LÓGICA CRUD DE POSTS (ADMIN.HTML) 
// =========================================================

async function loadAdminPosts() {
    const postListDiv = document.getElementById('postList');
    if (!postListDiv) return;
    postListDiv.innerHTML = '<p>Carregando posts para edição...</p>';

    const { data: posts, error } = await supabaseClient
        .from('posts')
        .select('*')
        .order('data_publicacao', { ascending: false }); 

    if (error) {
        postListDiv.innerHTML = `<p class="error-message">Erro: ${error.message}</p>`;
        return;
    }

    postListDiv.innerHTML = '';
    posts.forEach(post => {
        const postItem = document.createElement('div');
        postItem.classList.add('post-item');
        
        postItem.innerHTML = `
            <div>
                <h3>${post.titulo}</h3>
                <p>Autor: ${post.autor} | ${new Date(post.data_publicacao).toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
                <button class="edit-post-btn" data-id="${post.id}">Editar</button>
                <button class="delete-post-btn" data-id="${post.id}">Excluir</button>
            </div>
        `;
        postListDiv.appendChild(postItem);
    });
}

async function editPost(postId) {
    currentPostId = postId;
    const postForm = document.getElementById('postForm');
    postForm.style.display = 'block';
    
    postForm.scrollIntoView({ behavior: 'smooth' });

    const { data: post, error } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

    if (error) {
        alert('Erro ao carregar post para edição: ' + error.message);
        return;
    }

    document.getElementById('postTitle').value = post.titulo;
    document.getElementById('postAuthor').value = post.autor;
    
    const dateOnly = post.data_publicacao ? new Date(post.data_publicacao).toISOString().substring(0, 10) : '';
    document.getElementById('postDate').value = dateOnly;
    
    document.getElementById('postImage').value = post.image_url || '';
    document.getElementById('postShortDesc').value = post.short_descrip || '';
    document.getElementById('postContent').value = post.conteudo || '';
    // Converte array de tags de volta para string separada por vírgulas
    document.getElementById('postTags').value = post.tags ? post.tags.join(', ') : '';

    document.getElementById('postForm').querySelector('h3').textContent = 'Editar Postagem (ID: ' + postId + ')';
}

async function savePost(e) {
    e.preventDefault();

    const isEditing = currentPostId !== null;
    
    // Pega as tags do input e converte para um array
    const tagsArray = document.getElementById('postTags').value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    
    const postData = {
        titulo: document.getElementById('postTitle').value,
        autor: document.getElementById('postAuthor').value,
        data_publicacao: document.getElementById('postDate').value,
        image_url: document.getElementById('postImage').value.trim() || null, 
        short_descrip: document.getElementById('postShortDesc').value,
        conteudo: document.getElementById('postContent').value,
        tags: tagsArray // Salva como array no Supabase
    };

    let result;
    if (isEditing) {
        result = await supabaseClient
            .from('posts')
            .update(postData)
            .eq('id', currentPostId);
    } else {
        result = await supabaseClient
            .from('posts')
            .insert([postData]);
    }

    if (result.error) {
        alert(`Erro ao ${isEditing ? 'atualizar' : 'criar'} post: ${result.error.message}`);
    } else {
        alert(`Postagem ${isEditing ? 'atualizada' : 'criada'} com sucesso!`);
        document.getElementById('postEditorForm').reset();
        document.getElementById('postForm').style.display = 'none';
        currentPostId = null;
        loadAdminPosts(); 
    }
}

async function deletePost(postId) {
    if (!confirm('Tem certeza que deseja EXCLUIR este post permanentemente?')) return;

    const { error } = await supabaseClient
        .from('posts')
        .delete()
        .eq('id', postId);

    if (error) {
        alert('Erro ao excluir post: ' + error.message);
    } else {
        alert('Post excluído com sucesso!');
        loadAdminPosts(); 
    }
}

// =========================================================
// 🖼️ FRONTEND (INDEX.HTML) 
// =========================================================

async function loadAllPosts() {
    const postsGrid = document.getElementById('postsGrid');
    if (!postsGrid) return;
    
    // Exibe o carregamento enquanto a busca no Supabase acontece
    postsGrid.innerHTML = '<p class="loading">Carregando as últimas notícias...</p>';

    // Requisição: SELECT * ORDER BY data_publicacao DESC
    const { data: posts, error } = await supabaseClient
        .from('posts')
        .select('*')
        .order('data_publicacao', { ascending: false }); 

    if (error) {
        postsGrid.innerHTML = `<p class="error-message">Erro ao carregar posts: ${error.message}</p>`;
        return;
    }

    postsGrid.innerHTML = '';
    
    if (posts.length === 0) {
        postsGrid.innerHTML = `<p class="empty-message">Nenhuma postagem publicada ainda.</p>`;
        return;
    }

    posts.forEach(post => {
        const postCard = document.createElement('div');
        postCard.classList.add('post-card');
        postCard.addEventListener('click', () => showPostDetails(post.id));

        const imageUrl = post.image_url && post.image_url.trim() !== '' 
            ? post.image_url 
            : 'assets/imgs/default-cover.png'; // Caminho corrigido para consistência
            
        // Lógica para gerar as tags HTML
        const tagsHtml = post.tags && post.tags.length > 0
            ? post.tags.map(tag => `<span class="post-tag">${tag}</span>`).join('')
            : ''; 

        postCard.innerHTML = `
            <img src="${imageUrl}" alt="${post.titulo}">
            <div class="card-info">
                <h3 class="post-title">${post.titulo}</h3>
                <p class="post-summary">${post.short_descrip ? post.short_descrip.substring(0, 120) + '...' : ''}</p>
                <div class="post-meta">
                    <span class="date">${new Date(post.data_publicacao).toLocaleDateString('pt-BR')}</span>
                    <span class="author">${post.autor}</span>
                </div>
                <div class="post-tags-container">
                    ${tagsHtml}
                </div>
            </div>
        `;
        postsGrid.appendChild(postCard);
    });
}

async function showPostDetails(postId) {
    document.getElementById('home').classList.remove('active');
    document.getElementById('post-details').classList.add('active');
    window.scrollTo(0, 0);

    const { data: post, error } = await supabaseClient
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

    if (error) {
        alert('Erro ao carregar detalhes do post.');
        document.getElementById('post-details').classList.remove('active');
        document.getElementById('home').classList.add('active');
        return;
    }
    
    const imageUrl = post.image_url && post.image_url.trim() !== '' 
        ? post.image_url 
        : 'assets/imgs/default-cover.png'; 

    document.getElementById('detailImage').src = imageUrl;
    document.getElementById('detailTitle').textContent = post.titulo;
    document.getElementById('detailDate').textContent = new Date(post.data_publicacao).toLocaleDateString('pt-BR');
    document.getElementById('detailAuthor').textContent = post.autor;
    document.getElementById('detailContent').innerHTML = post.conteudo || '';
    
    const tagsContainer = document.getElementById('detailTags');
    const tagsHtml = post.tags && post.tags.length > 0
        ? post.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')
        : '<span>Sem tags</span>';
    tagsContainer.innerHTML = tagsHtml;
}

async function handleSuggestionSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('sugestaoName').value;
    const email = document.getElementById('sugestaoEmail').value;
    const idea = document.getElementById('sugestaoIdea').value;
    const messageEl = document.getElementById('sugestaoMessage');

    const { error } = await supabaseClient
        .from('sugestoes')
        .insert([{ nome: name, email: email, ideia: idea }]);

    if (error) {
        messageEl.textContent = 'Erro ao enviar sugestão: ' + error.message;
        messageEl.className = 'message error';
    } else {
        messageEl.textContent = 'Sugestão enviada com sucesso! Obrigado.';
        messageEl.className = 'message success';
        document.getElementById('suggestionForm').reset();
    }
    messageEl.style.display = 'block';
    setTimeout(() => messageEl.style.display = 'none', 5000);
}


// =========================================================
// 🚀 FUNÇÃO E LISTENERS DE INICIALIZAÇÃO (CORREÇÃO APLICADA)
// =========================================================

/**
 * Função dedicada para carregar os posts se a seção Home estiver ativa.
 * Isso resolve o problema de carregamento inicial em SPAs.
 */
function initializeHomeSection() {
    const homeSection = document.getElementById('home');
    // Verifica se a seção home existe E se ela tem a classe 'active'
    if (homeSection && homeSection.classList.contains('active')) {
        loadAllPosts();
        
        // Listener para o formulário de sugestão (só precisa ser anexado uma vez)
        const suggestionForm = document.getElementById('suggestionForm');
        if(suggestionForm && !suggestionForm.dataset.listenerAttached) {
            suggestionForm.addEventListener('submit', handleSuggestionSubmit);
            suggestionForm.dataset.listenerAttached = 'true'; // Previne múltiplos listeners
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    
    // 1. CONFIGURAÇÃO DE NAVEGAÇÃO
    document.querySelectorAll('header nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Permite que "admin.html" navegue normalmente (não é âncora)
            if (href && href.startsWith('#')) {
                e.preventDefault(); 
                const targetId = href.substring(1);
            
                // Alterna as classes de seção (SPA)
                document.querySelectorAll('.page-section').forEach(section => {
                    section.classList.remove('active');
                });
                document.getElementById(targetId).classList.add('active');

                // Atualiza o estado "active" do link da navegação
                document.querySelectorAll('header nav a').forEach(a => a.classList.remove('active'));
                this.classList.add('active');

                // Recarrega posts APENAS se for para 'home' (no clique de navegação)
                if(targetId === 'home') loadAllPosts();
            }
        });
    });

    // 2. INICIALIZAÇÃO DA PÁGINA PRINCIPAL (index.html)
    if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
        
        // **AÇÃO CORRIGIDA:** Chama a inicialização da Home
        initializeHomeSection(); 
    }

    // 3. Inicialização da página de administração (admin.html)
    if (window.location.pathname.includes('admin.html')) {
        const adminLoginForm = document.getElementById('adminLoginForm');
        const adminContentDiv = document.querySelector('.admin-content');
        const loginCard = document.querySelector('.admin-login-card');
        const logoutBtn = document.getElementById('logoutBtn');
        const postListDiv = document.getElementById('postList');
        const postEditorForm = document.getElementById('postEditorForm');


        if (checkAuthStatus()) {
            loginCard.style.display = 'none';
            adminContentDiv.style.display = 'block';
            
            // Carregamento de dados após autenticação
            loadSuggestions(); 
            loadAdminPosts();  
        } else {
            loginCard.style.display = 'block';
            adminContentDiv.style.display = 'none';
        }

        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const password = document.getElementById('adminPassword').value;
                if (await checkAdminPassword(password)) {
                    window.location.reload(); 
                } else {
                    alert('Senha incorreta!');
                }
            });
        }
        
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        // Listener de delegação para exclusão de sugestão
        const suggestionList = document.getElementById('suggestionList');
        if (suggestionList) {
             suggestionList.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-suggestion-btn')) {
                    deleteSuggestion(e.target.dataset.id); 
                }
            });
        }
        
        // Listeners do CRUD de Posts
        document.getElementById('addPostBtn').addEventListener('click', () => {
            currentPostId = null;
            document.getElementById('postForm').style.display = 'block';
            document.getElementById('postForm').querySelector('h3').textContent = 'Adicionar Nova Postagem';
            document.getElementById('postEditorForm').reset();
            document.getElementById('postForm').scrollIntoView({ behavior: 'smooth' });
        });
        
        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            document.getElementById('postEditorForm').reset();
            document.getElementById('postForm').style.display = 'none';
            currentPostId = null;
        });
        
        if (postListDiv) {
             postListDiv.addEventListener('click', (e) => {
                const postId = e.target.dataset.id;
                if (e.target.classList.contains('edit-post-btn')) {
                    editPost(postId);
                } else if (e.target.classList.contains('delete-post-btn')) {
                    deletePost(postId);
                }
            });
        }
        
        if (postEditorForm) {
            postEditorForm.addEventListener('submit', savePost);
        }
    }
});