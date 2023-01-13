#version 330 core
varying float x, y, z;
uniform float r_mod;
const float EPS = 1e-5;
const float PI = 3.14159265359;
const int DEPTH = 3;
uniform float time;

// -- RANDOM -------------------------------------------------------------------

float random_magic_parameter = 0;

// A single iteration of Bob Jenkins' One-At-A-Time hashing algorithm.
uint hash( uint x ) {
    x += ( x << 10u );
    x ^= ( x >>  6u );
    x += ( x <<  3u );
    x ^= ( x >> 11u );
    x += ( x << 15u );
    return x;
}

// Compound versions of the hashing algorithm I whipped together.
uint hash( uvec2 v ) { return hash( v.x ^ hash(v.y)                         ); }
uint hash( uvec3 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z)             ); }
uint hash( uvec4 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w) ); }

// Construct a float with half-open range [0:1] using low 23 bits.
// All zeroes yields 0.0, all ones yields the next smallest representable value below 1.0.
float floatConstruct( uint m ) {
    const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
    const uint ieeeOne      = 0x3F800000u; // 1.0 in IEEE binary32

    m &= ieeeMantissa;                     // Keep only mantissa bits (fractional part)
    m |= ieeeOne;                          // Add fractional part to 1.0

    float  f = uintBitsToFloat( m );       // Range [1:2]
    return f - 1.0;                        // Range [0:1]
}

// Pseudo-random value in half-open range [0:1].
float random( float x ) { return floatConstruct(hash(floatBitsToUint(x))); }
float random( vec2  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec3  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec4  v ) { return floatConstruct(hash(floatBitsToUint(v))); }

float rand(float l, float r) {
	random_magic_parameter += 0.1231;
	return l + random(vec4(x, y, time, random_magic_parameter)) * (r - l);
}

vec2 gaussian() {
	float x, y;
	float s = 2;
	int i = 0;
	while(s > 1 && i < 5) {
		x = rand(-1, 1);
		y = rand(-1, 1);
		s = x * x + y * y;
		i++;
	}
	return vec2(x * sqrt(-2 * log(s) / s), y * sqrt(-2 * log(s) / s));
}

// -- OBJECT STRUCTURES --------------------------------------------------------

struct Material {
	vec3 col;
	float glow;
	float ref;
};

struct Sphere {
	vec3 pos;
	float r;
	Material mat;
};

struct Plane {
	vec3 origin;
	vec3 norm;
	Material mat;
};

struct Triangle {
	vec3 vertices[3];
	Material mat;
};

// -- ARRAYS -------------------------------------------------------------------

Sphere spheres[10];
int spheres_number = 2;
Plane planes[10];
int planes_number = 5;
Triangle triangles[10];
int triangles_number = 0;

// -- RAYTRACING STRUCTURES ----------------------------------------------------

struct Cam {
	vec3 pos;
	vec3 dir;
	vec3 up;
	float focus;
};

vec3 calc_ray_dir(Cam cam, vec2 screen_coords) {
	vec3 right = -normalize(cross(cam.dir, cam.up));
	return normalize(
		screen_coords.x * right + 
		screen_coords.y * cam.up + 
		cam.focus * normalize(cam.dir));
}

struct Ray {
	vec3 origin;
	vec3 dir;
};

struct Collision {
	bool exists;
	vec3 pos;
	vec3 norm;
	Material mat;
};

// -- INTERSECTION METHODS -----------------------------------------------------

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
	coll.mat = sphere.mat;
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
	if (dot(ray.dir, coll.norm) > 0.0) {
		coll.norm *= -1;
	}

	coll.mat = plane.mat;
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
				triangle.vertices[2] - triangle.vertices[0]),
			triangle.mat));
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
		if (coll_cur.exists && dis_cur < dist_min) {
			dist_min = dis_cur;
			coll = coll_cur;
		}
	}
	
	return coll;
}

// -- PATH TRACING -------------------------------------------------------------
vec3 trace_path(Ray ray) {
	vec3 color = vec3(1,1,1) * 0.;
	vec3 color_modifier = vec3(1,1,1);
	for (int i = 0; i < 5; i++) {
		Collision coll = intersection(ray);
		if (coll.exists) {
			color += coll.mat.col * (coll.mat.glow);
			color_modifier *= coll.mat.col;// - vec3(1,1,1);
		} else {
			break;
		}
		vec3 n = normalize(coll.norm * dot(coll.norm, ray.dir));
		ray.origin = coll.pos + coll.norm * EPS;
		if (rand(0, 1) >= coll.mat.ref) {
			vec3 new_dir = normalize(vec3(gaussian(), gaussian().x));
			if (dot(coll.norm, new_dir) < 0) {
				new_dir *= -1;
			}
			ray.dir = new_dir;
		} else {
			ray.dir -= 2 * coll.norm * dot(coll.norm, ray.dir);
		}
	}
	
	return color * color_modifier;
}

// -- MAIN FUNCTION ------------------------------------------------------------

void main() {
	Cam cam = {{0.0, 0.0, -1.0}, {0.0, 0.0, 1.0}, {0.0, 1.0, 0.0}, 1.};

	Material white_light = {{1.0, 1.0, 1.0}, 1.0, 0.0};
	Material red_light = {{1.0, 0.4, 0.4}, 1.0, 0.0};
	Material blue_light = {{0.4, 0.4, 1.0}, 1.0, 0.0};
	Material mirror = {{0.0, 1.0, 0.0}, 0.0, 1.0};
	Material white_panel = {{1.0, 1.0, 1.0}, 0.0, 0.0};

	spheres_number = 4;
	spheres[0] = Sphere(vec3(-1.0, 1.0, 1.0), 0.5, red_light);
	spheres[1] = Sphere(vec3(1.0, 1.0, 1.0), 0.5, blue_light);
	spheres[3] = Sphere(vec3(0.3, 0.3, 1.), 0.2, mirror);
	spheres[2] = Sphere(vec3(-.3, -1.0, 0.3), 0.4, mirror);
	//spheres[4] = Sphere(vec3(0., -1.0, 0.0), 0.2, m4);
	planes_number = 6;
	planes[0] = Plane(vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), white_panel);
	planes[1] = Plane(vec3(-1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), white_panel);
	planes[2] = Plane(vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), white_panel);
	planes[3] = Plane(vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), white_panel);
	planes[4] = Plane(vec3(0.0, -1.0, 0.0), vec3(0.0, 1.0, 0.0), white_panel);
	planes[5] = Plane(vec3(0.0, 0.0, -3.0), vec3(0.0, 0.0, 1.0), white_light);

	vec3 ray_dir = calc_ray_dir(cam, vec2(x, y));
	int steps = 10;
	vec3 col = {0,0,0};
	for (int i = 0; i < steps; i++) {
		col += trace_path(Ray(cam.pos, ray_dir)) / steps;
	}
	gl_FragColor = vec4(col, 1);
}