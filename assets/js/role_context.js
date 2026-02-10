(function () {
    const path = window.location.pathname.split('/').pop() || '';
    const params = new URLSearchParams(window.location.search);
    const savedRole = window.sessionStorage.getItem('userRole');
    const savedRegion = window.sessionStorage.getItem('userRegion');

    let role = params.get('org') || savedRole || (path === 'local_dashboard.html' ? 'local' : 'mois');
    if (role !== 'local' && role !== 'mois') role = 'mois';

    const region = params.get('region') || savedRegion || '';
    window.sessionStorage.setItem('userRole', role);
    if (region) window.sessionStorage.setItem('userRegion', region);

    const sidebar = document.querySelector('.sidebar');
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (!sidebar || !sidebarNav) return;

    const menus = {
        mois: [
            { title: 'Overview', items: [
                ['dashboard.html', 'fa-chart-line', '전국 현황 대시보드'],
                ['ndms_linkage.html', 'fa-link', 'NDMS 연계 현황'],
                ['m1_integrated.html', 'fa-map', '전국 통합 관제 맵']
            ]},
            { title: 'Monitoring', items: [
                ['m2_satellite.html', 'fa-satellite-dish', '위성 변위 분석'],
                ['m3_danger.html', 'fa-triangle-exclamation', '고위험지 집중관리']
            ]},
            { title: 'Policy', items: [
                ['r1_report.html', 'fa-file-lines', '중앙 보고서 생성'],
                ['sensor_threshold.html', 'fa-sliders', '공통 임계치 정책']
            ]}
        ],
        local: [
            { title: 'Field Ops', items: [
                ['local_dashboard.html', 'fa-house-signal', '지자체 대시보드'],
                ['m1_integrated.html', 'fa-map-location-dot', '관할 통합 맵'],
                ['m2_satellite.html', 'fa-satellite', '위성 이상징후 분석'],
                ['m2_scenario.html', 'fa-helicopter', '드론 정밀 점검'],
                ['m3_danger.html', 'fa-triangle-exclamation', '붕괴 위험 조치관리']
            ]},
            { title: 'Execution', items: [
                ['r1_report.html', 'fa-clipboard-check', '점검결과 보고서'],
                ['sensor_threshold.html', 'fa-wave-square', '센서 임계치 조정']
            ]}
        ]
    };

    function withRole(url) {
        if (!url || !url.endsWith('.html')) return url;
        if (url === 'login.html' || url === 'admin_dashboard.html') return url;
        const link = new URL(url, window.location.origin + window.location.pathname);
        link.searchParams.set('org', role);
        if (role === 'local' && region) link.searchParams.set('region', region);
        return link.pathname.split('/').pop() + link.search;
    }

    const logoTitle = document.querySelector('.sidebar-logo h1');
    const logoSub = document.querySelector('.sidebar-logo span');
    if (logoTitle) {
        logoTitle.innerHTML = role === 'mois'
            ? '<i class="fas fa-shield-halved text-sky-600"></i>행정안전부 관제'
            : '<i class="fas fa-mountain-city text-emerald-600"></i>지자체 현장관리';
    }
    if (logoSub) {
        logoSub.textContent = role === 'mois'
            ? '전국 급경사지 통합 모니터링'
            : (region ? `${region} · 현장 점검 중심 운영` : '현장 점검 중심 운영 화면');
    }

    sidebarNav.innerHTML = menus[role].map(section => {
        const items = section.items.map(([href, icon, label]) => {
            const isActive = path === href;
            return `<a href="${withRole(href)}" class="nav-item${isActive ? ' active' : ''}"><i class="fas ${icon}"></i><span>${label}</span></a>`;
        }).join('');
        return `<div class="nav-section"><div class="nav-section-title">${section.title}</div>${items}</div>`;
    }).join('');

    const logoutLink = sidebar.querySelector('a[href="login.html"]');
    if (logoutLink) logoutLink.setAttribute('href', 'login.html');

    document.querySelectorAll('a[href$=".html"]').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#')) return;
        anchor.setAttribute('href', withRole(href));
    });

    const regionLabel = document.getElementById('regionLabel');
    if (regionLabel && role === 'local' && region) {
        regionLabel.textContent = `${region} · 현장 점검 중심 운영 화면`;
    }
})();
