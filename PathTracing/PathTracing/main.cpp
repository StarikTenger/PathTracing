#include <stdio.h>
#include <stdlib.h>
#include <GL/glew.h>
#include <GL/glut.h>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <iostream>
#include "BMPWriter.h"
#include "glm.hpp"
#include "Timer.h"

using namespace std;
using namespace glm;

struct Material {
	vec3 col;
	float glow;
	float ref;
	float diff;
	float refr;
	float refr_k;
};

struct Sphere {
	vec3 pos;
	float r;
	Material mat;
};

const int image_size = 1000;
const unsigned int steps = 10000;


GLuint ps, vs, prog, r_mod, timeq, window, uniform_size_x, uniform_size_y, 
	uniform_spheres;
float angle = 0;
unsigned char buff[image_size * image_size * 3];
unsigned long long bigbuff[image_size * image_size * 3];
int samples = 0;
Timer timer;

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

vector<Sphere> spheres;

void render(void) {
	glClear(GL_COLOR_BUFFER_BIT);

	glUniform1f(timeq, angle);

	timer.start("step " + to_string(samples));

	glBegin(GL_TRIANGLE_FAN);
	glVertex3f(-1, -1, 0);
	glVertex3f(-1, 1, 0);
	glVertex3f(1, 1, 0);
	glVertex3f(1, -1, 0);
	glEnd();

	glFlush();
	angle += 0.001;
	glReadPixels(0, 0, image_size, image_size, GL_BGR, GL_UNSIGNED_BYTE, buff);
	timer.finish();
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

	glUniform1f(r_mod, angle);
	
	glUniform1f(uniform_size_x, (float)image_size);
	glUniform1f(uniform_size_y, (float)image_size);
	glUniform1i(glGetUniformLocation(prog, "spheres_number"), (int32_t)spheres.size());
	for (int i = 0; i < spheres.size(); i++) {
		string sph = "spheres[" + to_string(i) + "]";
		glUniform3f(glGetUniformLocation(prog, (sph + ".pos").c_str()),
			spheres[i].pos.x, spheres[i].pos.y, spheres[i].pos.z);
		glUniform1f(glGetUniformLocation(prog, (sph + ".r").c_str()),
			spheres[i].r);
		glUniform3f(glGetUniformLocation(prog, (sph + ".mat.col").c_str()),
			spheres[i].mat.col.x, spheres[i].mat.col.y, spheres[i].mat.col.z);
		glUniform1f(glGetUniformLocation(prog, (sph + ".mat.glow").c_str()),
			spheres[i].mat.glow);
		glUniform1f(glGetUniformLocation(prog, (sph + ".mat.ref").c_str()),
			spheres[i].mat.ref);
		glUniform1f(glGetUniformLocation(prog, (sph + ".mat.diff").c_str()),
			spheres[i].mat.diff);
		glUniform1f(glGetUniformLocation(prog, (sph + ".mat.refr").c_str()),
			spheres[i].mat.refr);
		glUniform1f(glGetUniformLocation(prog, (sph + ".mat.refr_k").c_str()),
			spheres[i].mat.refr_k);
	}
}

int main(int argc, char** argv) {
	/*Material red_light = { {1.0, 1.0, 1.0}, 0.0, 1.0, 0.03, 0.9, 1.1};
	for (int i = 0; i < 10; i++) {
		red_light.col.x = cos(i * 3.3) * 0.5 + 0.5;
		red_light.col.y = sin(i * 1.153 + 1) * 0.5 + 0.5;
		red_light.col.z = sin(i * 2.234 + 0.454) * 0.5 + 0.5;
		spheres.push_back({ vec3(sin(i * 1.5) * 0.79, -0.9 + i * 0.18, cos(i * 0.6) * 0.7), 0.2f + (float)sin(i * 1.) * 0.1f, red_light });
	}*/

	Material red_light = { {1.0, 1.0, 1.0}, 0.0, 1.0, 0.003, 0.5, 1.5 };
	for (int i = 0; i < 85; i++) {
		float h = -0.9 + i * 0.02;
		float r = sqrt(1 - h * h);
		spheres.push_back({ vec3(sin(i * 0.3) * r, -0.9 + i * 0.02, cos(i * 0.3) * r), 0.1, red_light });
		spheres[i].mat.col = abs(spheres[i].pos);
		/*if (i % 5 == 0) {
			spheres[i].mat.glow = 1.0;
			spheres[i].mat.refr = 0.0;
			spheres[i].mat.ref = 0.0;
			spheres[i].mat.diff = 1.0;
		}*/
		//spheres.push_back({ vec3(sin(i * 0.5) * 0.6, -0.9 + i * 0.01, cos(i * 0.5) * 0.6), 0.17, red_light });
	}
	

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