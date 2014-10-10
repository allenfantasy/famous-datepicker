module.exports = function(grunt) {
  'use strict';
  return {
    options: {
      files: ['package.json'],
      updateConfigs: [],
      add: true,
      addFiles: ['.'], // '.' for all files except ingored files in .gitignore
      commit: true,
      commitMessage: 'Release v%VERSION%',
      commitFiles: ['-a'], // '-a' for all files
      createTag: true,
      tagName: 'v%VERSION%',
      tagMessage: 'Version %VERSION%',
      push: true,
      pushTo: 'origin',
      npm: false,
      npmTag: 'Release v%VERSION%',
      gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d' // options to use with '$ git describe'
    }
  }
} 
