// Core mathematical module for sequence space and coverage calculations
const FIXED_AA = {
    "NNN": [...Array(2).fill(1/64), ...Array(9).fill(2/64), ...Array(1).fill(3/64), ...Array(5).fill(4/64), ...Array(3).fill(6/64)],
    "NNK": [...Array(12).fill(1/32), ...Array(5).fill(2/32), ...Array(3).fill(3/32)],
    "DKS": [...Array(8).fill(1/12), ...Array(2).fill(2/12)],
    "MAX": Array(20).fill(1/20)
};

// Map NNS to NNK
FIXED_AA["NNS"] = FIXED_AA["NNK"];

function logfactorial(n) {
    if (n === 0 || n === 1) return 0.0;
    let sum = 0.0;
    for (let i = 2; i <= n; i++) {
        sum += Math.log(i);
    }
    return sum;
}

// Generates log-space composition distribution for small blocks
function compositions_logdist(q, m) {
    const K = q.length;
    const logq = q.map(v => Math.log(v));
    const results = new Map();
    
    function rec(i, remaining, sumlog, logmult) {
        if (i === K - 1) {
            const sumlog2 = sumlog + remaining * logq[K - 1];
            const logmult2 = logmult - logfactorial(remaining);
            const key = Math.round(sumlog2 * 1e12) / 1e12; // round to 12 decimal places to avoid drift
            const curr = results.get(key) || 0;
            results.set(key, curr + Math.exp(logmult2));
            return;
        }
        for (let v = 0; v <= remaining; v++) {
            rec(i + 1, remaining - v, sumlog + v * logq[i], logmult - logfactorial(v));
        }
    }
    rec(0, m, 0.0, logfactorial(m));
    return results;
}

function convolve_logdists(d1, d2) {
    const out = new Map();
    for (const [s1, m1] of d1.entries()) {
        for (const [s2, m2] of d2.entries()) {
            const key = Math.round((s1 + s2) * 1e12) / 1e12;
            const curr = out.get(key) || 0;
            out.set(key, curr + m1 * m2);
        }
    }
    return out;
}

function dist_power(dist, t) {
    if (t === 0) {
        return new Map([[0.0, 1.0]]);
    }
    if (t === 1) {
        return dist;
    }
    let res = new Map([[0.0, 1.0]]);
    let base = dist;
    let power = t;
    
    while (power > 0) {
        if (power % 2 === 1) {
            res = convolve_logdists(res, base);
        }
        base = convolve_logdists(base, base);
        power = Math.floor(power / 2);
    }
    return res;
}

function build_dist(q, L, base_size = 3) {
    if (L === 0) return new Map([[0.0, 1.0]]);
    const base_dist = compositions_logdist(q, Math.min(L, base_size));
    const full_blocks = Math.floor(L / base_size);
    const rem = L % base_size;
    
    let dist = dist_power(base_dist, full_blocks);
    if (rem > 0) {
        const rem_dist = compositions_logdist(q, rem);
        dist = convolve_logdists(dist, rem_dist);
    }
    return dist;
}

function build_dist_blocks(blocks, base_size = 3) {
    let first = true;
    let dist = new Map();
    let n_eff = 1.0;
    
    for (const block of blocks) {
        const mask = block.scheme;
        const cnt = parseInt(block.count, 10);
        if (cnt <= 0) continue;
        const q = FIXED_AA[mask];
        const d = build_dist(q, cnt, base_size);
        
        if (first) {
            dist = d;
        } else {
            dist = convolve_logdists(dist, d);
        }
        n_eff *= Math.pow(q.length, cnt);
        first = false;
    }
    return { dist, n_eff };
}

function T1_from_dist(dist, n_eff, S) {
    let T1 = 0.0;
    for (const [sumlogp, mult] of dist.entries()) {
        const p = Math.exp(sumlogp);
        T1 += mult * (1.0 - Math.exp(S * Math.log1p(-p)));
    }
    return T1 / n_eff;
}

function Tk_calc(T1_val, k) {
    if (k === "Full") return -1; // Specific case
    return 1.0 - Math.pow(1.0 - T1_val, parseInt(k));
}

function coverage_lower_bound(dist, S) {
    let miss = 0.0;
    for (const [sumlogp, mult] of dist.entries()) {
        const p = Math.exp(sumlogp);
        miss += mult * Math.exp(S * Math.log1p(-p));
    }
    return Math.max(0.0, 1.0 - miss);
}

// Bisection to find root
function find_zero(f, lower_bound, upper_bound, tol = 1e-6) {
    let low = lower_bound;
    let high = upper_bound;
    
    // Safety check boundaries
    if (Math.sign(f(low)) === Math.sign(f(high))) {
        throw new Error("Function boundaries do not straddle zero.");
    }
    
    let mid;
    for (let i = 0; i < 1000; i++) {
        mid = (low + high) / 2;
        const val = f(mid);
        if (Math.abs(val) < tol || (high - low) / 2 < tol) {
            return mid;
        }
        if (Math.sign(val) === Math.sign(f(low))) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return mid;
}

function solve_S_dist(target_prob, kStr, dist, n_eff) {
    const k = kStr === "Full" ? "Full" : parseFloat(kStr);
    
    function get_prob(ls) {
        const S = Math.pow(10, ls);
        if (k === "Full") {
            return coverage_lower_bound(dist, S) - target_prob;
        } else {
            const t1 = T1_from_dist(dist, n_eff, S);
            return (1.0 - Math.pow(1.0 - t1, k)) - target_prob;
        }
    }

    const lower_bound = 0.0;
    const upper_bound = 20.0;
    
    if (get_prob(lower_bound) >= 0) return 1;
    if (get_prob(upper_bound) < 0) return -2; // Indicates >10^20
    
    try {
        const logS = find_zero(get_prob, lower_bound, upper_bound);
        return Math.pow(10, logS);
    } catch (e) {
        return -2;
    }
}

function find_max_L_discrete(S, target_Tk, kStr, schema_name, L_bounds = [1, 15]) {
    const k = parseFloat(kStr);
    let target_T1 = 1.0 - Math.pow(1.0 - target_Tk, 1/k);
    let max_l = 0;
    for (let l = L_bounds[0]; l <= L_bounds[1]; l++) {
        const {dist, n_eff} = build_dist_blocks([{scheme: schema_name, count: l}]);
        const t1 = T1_from_dist(dist, n_eff, S);
        if (t1 >= target_T1) {
            max_l = l;
        } else {
            break;
        }
    }
    return max_l;
}

// Add these to window so app.js can access them
window.libraryCalculator = {
    build_dist_blocks,
    solve_S_dist,
    T1_from_dist,
    Tk_calc,
    coverage_lower_bound,
    find_max_L_discrete,
    FIXED_AA
};
