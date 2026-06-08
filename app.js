document.addEventListener("DOMContentLoaded", () => {
    // Tab Switching Logic
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    // Block Building Logic
    const initBlocks = (containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        addBlock(containerId);
    };

    const addBlock = (containerId) => {
        const container = document.getElementById(containerId);
        const template = document.getElementById('block-template');
        const clone = template.content.cloneNode(true);
        const block = clone.querySelector('.scheme-block');
        
        block.querySelector('.btn-remove-block').addEventListener('click', () => {
            if (container.children.length > 1) { // Leave at least 1
                block.remove();
            }
        });
        container.appendChild(block);
    };

    document.querySelectorAll('.btn-add-block').forEach(btn => {
        btn.addEventListener('click', (e) => {
            addBlock(e.target.closest('.btn-add-block').dataset.target);
        });
    });

    initBlocks('s_blocks_container');
    initBlocks('tk_blocks_container');

    const getBlocks = (containerId) => {
        const container = document.getElementById(containerId);
        const blocks = [];
        container.querySelectorAll('.scheme-block').forEach(block => {
            blocks.push({
                scheme: block.querySelector('.block-scheme').value,
                count: parseInt(block.querySelector('.block-count').value, 10)
            });
        });
        return blocks;
    };

    // Calculate Required S
    document.getElementById('btn_calc_s').addEventListener('click', () => {
        const prob = parseFloat(document.getElementById('s_prob').value);
        const kStr = document.getElementById('s_k').value.trim();
        const blocks = getBlocks('s_blocks_container');

        const { dist, n_eff } = window.libraryCalculator.build_dist_blocks(blocks);
        const S = window.libraryCalculator.solve_S_dist(prob, kStr, dist, n_eff);

        const resBox = document.getElementById('res_s');
        if (S === -2) {
            showResult(resBox, "Required S", "> 1.00e+20");
        } else {
            showResult(resBox, "Required S", formatScientific(S));
        }
    });

    // Calculate Coverage Tk
    document.getElementById('btn_calc_tk').addEventListener('click', () => {
        const S = parseFloat(document.getElementById('tk_s').value);
        const kStr = document.getElementById('tk_k').value.trim();
        const blocks = getBlocks('tk_blocks_container');

        const { dist, n_eff } = window.libraryCalculator.build_dist_blocks(blocks);
        
        let res = 0;
        if (kStr === "Full" || kStr.toLowerCase() === "full") {
            // Approximation for full
            res = window.libraryCalculator.coverage_lower_bound(dist, S);
        } else {
            const t1 = window.libraryCalculator.T1_from_dist(dist, n_eff, S);
            res = window.libraryCalculator.Tk_calc(t1, kStr);
        }

        const resBox = document.getElementById('res_tk');
        showResult(resBox, "Expected Probability (Tk)", (res * 100).toFixed(6) + "%");
    });

    // Calculate Max L
    document.getElementById('btn_calc_maxl').addEventListener('click', () => {
        const S = parseFloat(document.getElementById('ml_s').value);
        const prob = parseFloat(document.getElementById('ml_prob').value);
        const kStr = document.getElementById('ml_k').value.trim();
        const scheme = document.getElementById('ml_scheme').value;

        const maxL = window.libraryCalculator.find_max_L_discrete(S, prob, kStr, scheme, [1, 25]); // bounding search up to l=25
        
        const resBox = document.getElementById('res_maxl');
        showResult(resBox, "Maximum Randomised Positions (L)", maxL.toString());
    });

    const formatScientific = (num) => {
        if (num < 1000000) {
            return num.toLocaleString();
        }
        return num.toExponential(2).replace('e+', 'e');
    };

    const showResult = (box, title, value) => {
        box.innerHTML = `
            <div class="res-title">${title}</div>
            <div class="res-value">${value}</div>
        `;
        box.style.display = 'block';
    };

    // Collapsible instructions
    const instructionsToggle = document.getElementById('instructions-toggle');
    const instructionsContent = document.getElementById('instructions-content');
    if (instructionsToggle && instructionsContent) {
        instructionsToggle.addEventListener('click', () => {
            const isHidden = instructionsContent.style.display === 'none';
            instructionsContent.style.display = isHidden ? 'block' : 'none';
            instructionsToggle.classList.toggle('open', isHidden);
        });
    }
});
