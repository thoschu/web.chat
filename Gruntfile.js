module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        buddyjs: {
            src: ['index.js'],
            options: {
                // ...
            }
        },
    });

    grunt.loadNpmTasks('grunt-buddyjs');

    // Default task(s).
    grunt.registerTask('default', ['buddyjs']);

};