#include <stdio.h>
#include <stdlib.h>
#include <GL/glew.h>
#include <GL/glut.h>
#include <fstream>
#include <sstream>

using namespace std;

GLuint ps, vs, prog, r_mod;
float angle = 0;
void render(void)
{
	glClear(GL_COLOR_BUFFER_BIT);
	glUniform1f(r_mod, angle);

	glBegin(GL_TRIANGLE_FAN);
	glVertex3f(-1, -1, 0);
	glVertex3f(-1, 1, 0);
	glVertex3f(1, 1, 0);
	glVertex3f(1, -1, 0);
	glEnd();
	angle += .002;
	glutSwapBuffers();
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
}

int main(int argc, char** argv)
{
	glutInit(&argc, argv);
	glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB);
	glutInitWindowSize(600, 600);
	glutCreateWindow("Stuff");
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