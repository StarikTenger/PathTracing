varying float x, y, z;
uniform float r_mod;

struct Sphere {
	vec3 pos;
	float r;
	vec3 col;
	float glow;
	float ref;
};

Sphere spheres[1];

struct Cam {
	vec3 pos;
	vec3 dir;
	vec3 up;
	float focus;
};

vec3 calc_ray_dir(Cam cam, vec2 screen_coords) {
	vec3 right = normalize(cross(cam.dir, cam.up));
	return normalize(
		screen_coords.x * right + 
		screen_coords.y * cam.up + 
		normalize(cam.focus) * cam.dir);
}

struct Collision {
	bool exists;
	vec3 pos;
	vec3 norm;
};

Collision intersect_sphere(vec3 pos, vec3 dir, Sphere sphere) {
	// coords relative to sphere center
	vec3 pos_rel = pos - sphere.pos;
	float coef_a = dot(dir, dir);
	float coef_b = 2.0 * dot(pos_rel, dir);
	float coef_c = dot(pos_rel, pos_rel) - sphere.r * sphere.r;
	float discriminant = coef_b * coef_b - 4.0 * coef_a * coef_c;
	Collision coll;
	if (discriminant < 0.0) {
		coll.exists = false;
		return coll;
	}
	coll.exists = true;
	float t = (-coef_b - sqrt(discriminant)) / (2.0 * coef_a);
	vec3 intersection = t * dir + pos_rel;
	coll.pos = intersection + sphere.pos;
	coll.norm = normalize(intersection);
	return coll;
}

void main() {
	Cam cam = {{0.0, 0.0, -1.0}, {0.0, 0.0, 1.0}, {0.0, 1.0, 0.0}, 0.5};
	spheres[0] = Sphere(vec3(0.0, 0.0, 0.0), 0.5, vec3(1.0, 1.0, 1.0), 0.0, 0.0);

	vec3 ray_dir = calc_ray_dir(cam, vec2(x, y));
	
	Collision coll = intersect_sphere(cam.pos, ray_dir, spheres[0]);
	if (coll.exists) {
		gl_FragColor = vec4(abs(coll.norm), 1.0) ;
	} else {
		gl_FragColor = vec4(1.0, 1., 1., 1.0) * 0.0;
	}
}