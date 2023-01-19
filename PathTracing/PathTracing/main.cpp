#include <stdio.h>
#include <stdlib.h>
#include <GL/glew.h>
#include <GL/glut.h>
#include <fstream>
#include <sstream>
#include <iostream>
#include "BMPWriter.h"

using namespace std;

const int image_size = 800;
const unsigned int steps = 1000;


GLuint ps, vs, prog, r_mod, timeq, window, uniform_size_x, uniform_size_y;
float angle = 0;
unsigned char buff[image_size * image_size * 3];
unsigned long long bigbuff[image_size * image_size * 3];
int samples = 0;

void add_sample() {
	samples++;
	for (int i = 0; i < image_size * image_size * 3; i++) {
		bigbuff[i] += buff[i];
	}
}

void sum_samples() {
	for (int i = 0; i < image_size * image_size * 3; i++) {
		buff[i] = bigbuff[i] / samples;
	}
	generateBitmapImage(buff, image_size, image_size, (char*)"image.bmp");
}

void render(void) {
	glClear(GL_COLOR_BUFFER_BIT);
	glUniform1f(r_mod, angle);
	glUniform1f(timeq, angle);
	glUniform1f(uniform_size_x, (float)image_size);
	glUniform1f(uniform_size_y, (float)image_size);

	glBegin(GL_TRIANGLE_FAN);
	glVertex3f(-1, -1, 0);
	glVertex3f(-1, 1, 0);
	glVertex3f(1, 1, 0);
	glVertex3f(1, -1, 0);
	glEnd();
	glFlush();
	angle +=0.001;
	glReadPixels(0, 0, image_size, image_size, GL_BGR, GL_UNSIGNED_BYTE, buff);
	add_sample();
	cout << samples << "\n";
	if (samples >= steps) {	
		sum_samples();
		glutDestroyWindow(window);
	}
}

void set_shader() {
	ifstream shader_file("shader.frag");
	std::stringstream buffer;
	buffer << shader_file.rdbuf();
	string buffstring = buffer.str();
	const char* f = buffstring.c_str();
	const char* v =
		"varying float x, y, z;"
		"void main() {"
		"	gl_Position = ftransform();"
		"	x = gl_Position.x; y = gl_Position.y; z = gl_Position.z;"
		"}";

	vs = glCreateShader(GL_VERTEX_SHADER);
	ps = glCreateShader(GL_FRAGMENT_SHADER);
	glShaderSource(ps, 1, &f, 0);
	glShaderSource(vs, 1, &v, 0);

	glCompileShader(vs);
	glCompileShader(ps);

	prog = glCreateProgram();
	glAttachShader(prog, ps);
	glAttachShader(prog, vs);

	glLinkProgram(prog);
	glUseProgram(prog);
	r_mod = glGetUniformLocation(prog, "r_mod");
	timeq = glGetUniformLocation(prog, "time");
	uniform_size_x = glGetUniformLocation(prog, "size_x");
	uniform_size_y = glGetUniformLocation(prog, "size_y");
}

int main(int argc, char** argv)
{
	glutInit(&argc, argv);
	glutInitDisplayMode(GLUT_SINGLE | GLUT_RGB);
	glutInitWindowSize(image_size, image_size);
	window = glutCreateWindow("Zhopa");
	glutIdleFunc(render);

	glewInit();
	if (!glewIsSupported("GL_VERSION_2_0")) {
		fprintf(stderr, "GL 2.0 unsupported\n");
		return 1;
	}

	glutDisplayFunc(render);

	set_shader();
	glutMainLoop();

	return 0;
}