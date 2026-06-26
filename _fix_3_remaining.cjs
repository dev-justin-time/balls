const fs = require('fs');
const path = 'C:/Users/dividicus/Downloads/web_cloud_os_by_ou812/apps/sot_visualization.html';
let code = fs.readFileSync(path, 'utf8');
let changes = 0;

// Fix 1: Prime Numbers Unicode - \u2117 (\u2117) should be \u2119 (\u2119)
// \u2117 = ℗ (sound recording copyright), \u2119 = ℙ (double-struck P)
const primePattern = "{ sym:'\\u2117', desc:'Prime Numbers'";
const primeReplace = "{ sym:'\\u2119', desc:'Prime Numbers (double-struck P)'";
if (code.includes(primePattern)) {
    code = code.replace(primePattern, primeReplace);
    changes++;
    console.log('✓ Prime Unicode fixed');
} else {
    console.log('✗ Prime pattern not found');
}

// Fix 2: Remove the duplicate \u2202 (∂) Boundary Operator line
// It has the same character as Partial Derivative
const boundaryFullLine = "        { sym:'\\u2202', desc:'Boundary Operator', type:'unary', arity:1, logic:'\\u2202M returns the topological BOUNDARY of manifold M. Used in homology' },\n";
if (code.includes(boundaryFullLine)) {
    code = code.replace(boundaryFullLine, '');
    changes++;
    console.log('✓ Duplicate boundary operator removed');
} else {
    console.log('✗ Boundary operator line not found');
}

// Fix 3: Double integral - replace two-char sequence with single quad integral char
const dblIntPattern = "{ sym:'\\u222b\\u222b', desc:'Double Integral'";
const dblIntReplace = "{ sym:'\\u2A0C', desc:'Double Integral (over 2D region)'";
if (code.includes(dblIntPattern)) {
    code = code.replace(dblIntPattern, dblIntReplace);
    changes++;
    console.log('✓ Double integral char fixed');
} else {
    console.log('✗ Double integral pattern not found');
}

fs.writeFileSync(path, code, 'utf8');
console.log('✓ Saved (' + changes + ' fixes)');
