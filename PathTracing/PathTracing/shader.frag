#version 150
varying float x, y, z;
uniform float r_mod;
const float EPS = 1e-5;
const float PI = 3.14159265359;

struct Sphere {
	vec3 pos;
	float r;
	vec3 col;
	float glow;
	float ref;
};

struct Plane {
	vec3 origin;
	vec3 norm;
};

struct Triangle {
	vec3 vertices[3];
};

Sphere spheres[10];
int spheres_number = 1;
Plane planes[10];
int planes_number = 0;
Triangle triangles[10];
int triangles_number = 1;

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
		normalize(cam.focus) * normalize(cam.dir));
}

struct Ray {
	vec3 origin;
	vec3 dir;
};

struct Collision {
	bool exists;
	vec3 pos;
	vec3 norm;
};

// calculates intersection with sphere
Collision intersect_sphere(Ray ray, Sphere sphere) {
	// coords relative to sphere center
	vec3 pos_rel = ray.origin - sphere.pos;
	float coef_a = dot(ray.dir, ray.dir);
	float coef_b = 2.0 * dot(pos_rel, ray.dir);
	float coef_c = dot(pos_rel, pos_rel) - sphere.r * sphere.r;
	float discriminant = coef_b * coef_b - 4.0 * coef_a * coef_c;

	Collision coll;
	if (discriminant < 0.0) {
		coll.exists = false;
		return coll;
	}

	coll.exists = true;
	float t = (-coef_b - sqrt(discriminant)) / (2.0 * coef_a);

	if (t < 0.0) {
		coll.exists = false;
		return coll;
	}

	vec3 intersection = t * ray.dir + pos_rel;
	coll.pos = intersection + sphere.pos;
	coll.norm = normalize(intersection);
	return coll;
}

// calculates intersection with plane
Collision intersect_plane(Ray ray, Plane plane) {
	Collision coll;
	coll.exists = false;
	ray.dir = normalize(ray.dir);
	plane.norm = normalize(plane.norm);	


    coll.pos = ray.origin + ray.dir * 
		dot(plane.origin - ray.origin, plane.norm) / 
		dot(ray.dir, plane.norm);
	
	if (dot(ray.dir, coll.pos - ray.origin) >= 0.0) {
		coll.exists = true;
	}
	coll.norm = plane.norm;
	if (dot(ray.dir, coll.norm) < 0.0) {
		coll.norm *= -1;
	}

	return coll;
}

// calculates intersection with traingle
Collision intersect_triangle(Ray ray, Triangle triangle) {
	Collision coll;
	coll.exists = false;
	ray.dir = normalize(ray.dir);
	
    int positives = 0;
    int negatives = 0;
	for (int i = 0; i < 3; i++) {
//		float area = 0.5 * determinant(mat3(
//			triangle.vertices[(i + 1) % 3] - ray.origin,
//			triangle.vertices[(i + 2) % 3] - ray.origin,
//			ray.dir));
		float area = 0.5 * dot(cross(
			triangle.vertices[(i + 1) % 3] - ray.origin,
			triangle.vertices[(i + 2) % 3] - ray.origin),
			ray.dir);
		if (area >= 0) {
			positives++;
		}
		if (area <= 0) {
			negatives++;
		}
	}

	if (positives == 3 || negatives == 3) {
		coll = intersect_plane(ray, Plane(triangle.vertices[0], 
			cross(
				triangle.vertices[1] - triangle.vertices[0], 
				triangle.vertices[2] - triangle.vertices[0])));
	}

	return coll;
}

// finds nearest intersection
Collision intersection(Ray ray) {
	Collision coll;
	coll.exists = false;
	float dist_min = 1e9;
	
	// check spheres
	for (int i = 0; i < spheres_number; i++) {
		Collision coll_cur = intersect_sphere(ray, spheres[i]);
		float dis_cur = distance(ray.origin, coll_cur.pos);
		if (coll_cur.exists &&dis_cur < dist_min) {
			dist_min = dis_cur;
			coll = coll_cur;
		}
	}

	// check planes
	for (int i = 0; i < planes_number; i++) {
		Collision coll_cur = intersect_plane(ray, planes[i]);
		float dis_cur = distance(ray.origin, coll_cur.pos);
		if (coll_cur.exists &&dis_cur < dist_min) {
			dist_min = dis_cur;
			coll = coll_cur;
		}
	}

	// check triangles
	for (int i = 0; i < triangles_number; i++) {
		Collision coll_cur = intersect_triangle(ray, triangles[i]);
		float dis_cur = distance(ray.origin, coll_cur.pos);
		if (coll_cur.exists &&dis_cur < dist_min) {
			dist_min = dis_cur;
			coll = coll_cur;
		}
	}
	
	return coll;
}

void main() {
	Cam cam = {{0.0, 0.0, -1.0}, {0.0, 0.0, 1.0}, {0.0, 1.0, 0.0}, 100.};
	spheres[0] = Sphere(vec3(0.0, 0.0, 0.0), 0.5, vec3(1.0, 1.0, 1.0), 0.0, 0.0);
	spheres[1] = Sphere(vec3(0.2, 0.3, -0.2), 0.2, vec3(1.0, 1.0, 1.0), 0.0, 0.0);
	spheres[2] = Sphere(vec3(-0.2, 0.3, -0.2), 0.2, vec3(1.0, 1.0, 1.0), 0.0, 0.0);
	planes[0] = Plane(vec3(0.0, -.2, 0.0), vec3(0.0, 1.0, 0.0));
	float p = sin(r_mod * 0.2);
	triangles[0] = Triangle(vec3[3](
		vec3(0.0, 0.0, p),
		vec3(0.0, 1.0, p), 
		vec3(1.0, 1.0, p)));

	vec3 ray_dir = calc_ray_dir(cam, vec2(x, y));
	
	gl_FragColor = vec4(1.0, 1., 1., 1.0) * 0.0;
	
	Collision coll = intersection(Ray(cam.pos, ray_dir));
	if (coll.exists) {
		gl_FragColor = vec4(abs(coll.norm), 1.0) ;
	}
}