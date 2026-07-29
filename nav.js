document.addEventListener("DOMContentLoaded", () => {
    const siteNav = document.querySelector(".site-nav");
    const hamburgerBtn = document.getElementById("hamburger-btn");

    if (hamburgerBtn && siteNav) {
        hamburgerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = siteNav.classList.toggle("nav-open");
            if (isOpen) {
                document.body.classList.add("nav-menu-open");
            } else {
                document.body.classList.remove("nav-menu-open");
            }
        });

        // Close menu when clicking outside
        document.addEventListener("click", (e) => {
            if (siteNav.classList.contains("nav-open") && !siteNav.contains(e.target)) {
                siteNav.classList.remove("nav-open");
                document.body.classList.remove("nav-menu-open");
            }
        });

        // Handle mobile accordion toggle on nav-items
        const navItems = document.querySelectorAll(".nav-item > a");
        navItems.forEach(itemLink => {
            itemLink.addEventListener("click", (e) => {
                if (window.innerWidth <= 768) {
                    const navItem = itemLink.parentElement;
                    const hasDropdown = navItem.querySelector(".dropdown");
                    if (hasDropdown) {
                        e.preventDefault();
                        navItem.classList.toggle("active");
                    }
                }
            });
        });
    }
});
