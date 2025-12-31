// const fs = require('fs');
// const path = require('path');

// const projectDirectory = 'H:/Protean_new Live/protean_back-end'; // Replace with your project directory
// let totalLines = 0;

// function countLinesInFile(filePath) {
//   const fileContents = fs.readFileSync(filePath, 'utf8');
//   const lines = fileContents.split('\n').filter(line => line.trim() !== '' && !line.trim().startsWith('//')).length;
//   return lines;
// }

// function countLinesInDirectory(directory) {
//   const files = fs.readdirSync(directory);

//   files.forEach((file) => {
//     const filePath = path.join(directory, file);
//     const stats = fs.statSync(filePath);

//     if (stats.isDirectory() && file !== 'node_modules') {
//       countLinesInDirectory(filePath);
//     } else if (path.extname(file) === '.js') {
//       const lines = countLinesInFile(filePath);
//       totalLines += lines;
//       console.log(`File: ${filePath} - Lines of code: ${lines}`);
//     }
//   });
// }

// countLinesInDirectory(projectDirectory);
// console.log(`Total lines of code in JS files: ${totalLines}`);
