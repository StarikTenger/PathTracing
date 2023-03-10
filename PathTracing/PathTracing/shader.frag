#version 430 core
varying float x, y, z;
uniform float r_mod;
const float EPS = 1e-5;
const float PI = 3.14159265359;
const int DEPTH = 10;
const bool USE_BIDIRECTIONAL = true;
uniform float time;
uniform float size_x;
uniform float size_y;

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
	float diff;
	float refr;
	float refr_k;
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
	bool chess;
};

struct Triangle {
	vec3 vertices[3];
	Material mat;
};

bool chess_coloring(vec2 pos, float k){
	return (sign(sin(pos.x/k*PI/2)) == sign(sin(pos.y/k*PI/2)));
}


Material white_light = {{1.0, 1.0, 1.0}, 10.0, 0.0, 0.0, 0.0, 0.0};

// -- ARRAYS -------------------------------------------------------------------

uniform Sphere spheres[100];
uniform int spheres_number;
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
	screen_coords.x += rand(0, 1) / size_x;
	screen_coords.y += rand(0, 1) / size_y;
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

// -- PICKING RANDOM POINTS ----------------------------------------------------

vec3 pick_random_point(Triangle p) {
	vec2 coords = {rand(0, 1), rand(0, 1)};
	if (coords.x + coords.y > 1) {
		coords = vec2(1 - coords.y, 1 - coords.x);
	}
	return p.vertices[0] + 
		(p.vertices[1] - p.vertices[0]) * coords.x  + 
		(p.vertices[2] - p.vertices[0]) * coords.y;
}

struct RayInit {
	Ray ray;
	vec3 col;
};

// TODO: estimate surface areas
RayInit random_light_ray() {
	int i = int(rand(0, triangles_number));
	vec3 p = pick_random_point(triangles[i]);
	vec3 dir = normalize(vec3(gaussian(), gaussian().x));
	return RayInit(Ray(p, dir), vec3(10, 10, 10));
}

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
		t = (-coef_b + sqrt(discriminant)) / (2.0 * coef_a);
	}

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
	
	if (plane.chess && chess_coloring(coll.pos.xy, 0.1)) {
		coll.mat.col = vec3(1,1,1) - coll.mat.col;
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
			triangle.mat, false));
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

// Check if two points can be conected
bool check_visibility(vec3 p1, vec3 p2) {
	Collision coll = intersection(Ray(p1 + normalize(p2 - p1) * EPS, normalize(p2 - p1)));
	return distance(p1, p2) <= distance(p1, coll.pos) + EPS;
}

// Checks if the point projection is in current pixel
bool project_to_pixel(vec3 p, Cam cam) {
	vec3 f = cam.pos;
	// TODO: implement non-kostyle intersection
	vec3 proj = intersect_plane(Ray(p, normalize(f - p)), 
		Plane(cam.pos + cam.dir * cam.focus, cam.dir, white_light, false)).pos;
	vec3 right = -normalize(cross(cam.dir, cam.up));
	vec2 proj2d = {dot(proj, right), dot(proj, cam.up)};
		
	int proj_x = int(proj2d.x);
	int proj_y = int(proj2d.y);

	return distance(vec2(x, y), proj2d) < 0.01;//int(x * size_x) == proj_x && int(y * size_y) == proj_y;
}

// -- PATH TRACING -------------------------------------------------------------
Cam cam;

// path tracing result
struct TraceRes {
	vec3 color;
	vec3 color_modifier;
	Collision coll;
};

TraceRes cam_path[16];
int cam_path_size = 0;
TraceRes light_path[16];
int light_path_size = 0;

TraceRes trace_path(Ray ray, vec3 color_modifier, int depth, bool path_type) {
	vec3 color = vec3(0,0,0);
	Collision coll;

	for (int i = 0; i < depth; i++) {
		coll = intersection(ray);
		if (coll.exists) {
			
		} else {
			break;
		}
		vec3 n = normalize(coll.norm * dot(coll.norm, ray.dir));
		ray.origin = coll.pos + coll.norm * EPS;
		if (rand(0, 1) >= coll.mat.ref) { // fully diffuse
			color += coll.mat.col * (coll.mat.glow) * color_modifier;
			vec3 new_dir = normalize(vec3(gaussian(), gaussian().x));
			if (dot(coll.norm, new_dir) < 0) {
				new_dir *= -1;
			}
			ray.dir = new_dir;
		} else 
		if (rand(0, 1) < coll.mat.refr || dot(coll.norm, ray.dir) > 0) { // refraction
			//i--;
			vec3 new_dir = ray.dir;
			if (dot(coll.norm, ray.dir) < 0) {
				ray.origin = coll.pos - coll.norm * EPS;
				new_dir = refract(ray.dir, coll.norm, 1/coll.mat.refr_k);
			}
			else {
				ray.origin = coll.pos + coll.norm * EPS;
				new_dir = refract(ray.dir, -coll.norm, coll.mat.refr_k);
			}
			if (distance(vec3(0,0,0), new_dir) < 0.5) {
//				ray.origin = coll.pos - coll.norm * EPS;
//				new_dir = ray.dir;
//				new_dir = reflect(ray.dir, coll.norm);
//				new_dir -= 2 * coll.norm * dot(coll.norm, ray.dir);
//				new_dir += vec3(gaussian(), gaussian().x) * coll.mat.diff;
//				new_dir = normalize(new_dir);
			}
			ray.dir = new_dir;
		} else { // reflection
			ray.dir -= 2 * coll.norm * dot(coll.norm, ray.dir);
			vec3 diff_dir = normalize(vec3(gaussian(), gaussian().x));
			if (dot(coll.norm, diff_dir) < 0) {
				diff_dir *= -1;
			}
			ray.dir = normalize(ray.dir * (1 - coll.mat.diff) + diff_dir * coll.mat.diff);
		}
		color_modifier *= coll.mat.col;

		if (!path_type) { // 0 stands for cam_path
			cam_path[cam_path_size] = TraceRes(color, color_modifier, coll);
			cam_path_size++;
		} else { // 0 stands for light_path
			light_path[light_path_size] = TraceRes(color, color_modifier, coll);
			light_path_size++;
		}
	}
	
	return TraceRes(color, color_modifier, coll);
}

vec3 trace_bidirectional(Ray ray) {
	cam_path_size = 0;
	light_path_size = 0;
	int l = 5;
	int r = 5;
	TraceRes tres1 = trace_path(ray, vec3(1,1,1), l, false);
	RayInit rinit = random_light_ray();
	TraceRes tres2 = trace_path(rinit.ray, rinit.col, r, true);
	vec3 col_res = {0,0,0};

	light_path[0].coll.pos = rinit.ray.origin;
	light_path[0].color_modifier = rinit.col;

	for (int i = 0; i < cam_path_size; i++) {
		for (int j = 0; j < light_path_size; j++) {
			col_res += 
				light_path[j].color_modifier * cam_path[i].color_modifier
				/ dot(cam_path[i].coll.pos - light_path[j].coll.pos, cam_path[i].coll.pos - light_path[j].coll.pos) / 25
				* (1 - cam_path[i].coll.mat.ref)
				* (1 - light_path[j].coll.mat.ref)
				* (1 - cam_path[i].coll.mat.refr)
				* (1 - light_path[j].coll.mat.refr) * (i + j + 1);
		}
	}
	col_res /= cam_path_size * light_path_size; 
	col_res += tres1.color;
	return col_res;
}

// -- MAIN FUNCTION ------------------------------------------------------------


void main() {
	vec3 cam_pos = {-0.0, 0.0, -2};
	cam = Cam(cam_pos, (vec3(0.0, 0.0, 0.0) - cam_pos), vec3(0.0, 1.0, 0.0), 1.3);

	Material white_light = {{1.0, 1.0, 1.0}, 10.0, 0.0, 0.0, 0.0, 0.0};
	Material red_light = {{1.0, 0.7, 0.7}, 0.0, 1.0, 0.03, 0.0, 0.0};
	Material blue_light = {{1., 1., 1.0}, 0.0, 1.0, 0.06, .95, 1.13};
	Material mirror = {{1, 1, 1}, .0, 1.0, 0.0, 0.0, 0.0};
	Material mirror_1 = {{0.5, 0.0, 1.0}, 0.0, 0.3, 0.0, 0.0, 0.0};
	Material mirror_2 = {{0.5, 1.0, 0.6}, 0.0, 1.0, 0.0, 0.0, 0.0};
	Material white_panel = {vec3(1,1,1) * 0.9, 0.0, 0.0, 0.0, 0.0, 0.0};
	Material black_panel = {{0.0, 0.0, 0.0}, 0.0, 0.0, 0.0, 0.0, 0.0};
	Material green_panel = {{0, 1.0, 0}, 0.0, 0.0, 0.0, 0.0, 0.0};
	Material red_panel = {{1.0, 0, 0}, 0.0, 0.0, 0.0, 0.0, 0.0};
	Material blue_panel = {{0, 0, 1}, 0.0, 0.0, 0.0, 0.0, 0.0};

	triangles_number = 2;
	float lamp_size = 0.3;
	float lamp_h = 0.01;
	triangles[0] = Triangle(
			vec3[3](
				vec3(-lamp_size, 1 - lamp_h,-lamp_size),
				vec3(lamp_size, 1 - lamp_h,-lamp_size),
				vec3(-lamp_size, 1 - lamp_h,lamp_size)),
			white_light);
	triangles[1] = Triangle(
			vec3[3](
				vec3(lamp_size, 1 - lamp_h, lamp_size),
				vec3(-lamp_size, 1 - lamp_h,lamp_size),
				vec3(lamp_size, 1 - lamp_h,-lamp_size)),
			white_light);

	planes_number = 6;
	planes[0] = Plane(vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), white_panel, false);
	planes[1] = Plane(vec3(-1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0), green_panel, false);
	planes[2] = Plane(vec3(1.0, 0.0, 0.0), vec3(-1.0, 0.0, 0.0), red_panel, false);
	planes[3] = Plane(vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), white_panel, false);
	planes[4] = Plane(vec3(0.0, -1.0, 0.0), vec3(0.0, 1.0, 0.0), white_panel, false);
	planes[5] = Plane(vec3(0.0, 0.0, -2.01), vec3(0.0, 0.0, 1.0), black_panel, false);

	vec3 ray_dir = calc_ray_dir(cam, vec2(x, y));
	int steps = 10;
	vec3 col = {0,0,0};
	if (USE_BIDIRECTIONAL) {
		for (int i = 0; i < steps; i++) {
			col += trace_bidirectional(Ray(cam.pos, ray_dir)) / steps;
		}
	} else {
		for (int i = 0; i < steps; i++) {
			col += trace_path(Ray(cam.pos, ray_dir), vec3(1,1,1), DEPTH, false).color / steps;
		}
	}
	
	gl_FragColor = vec4(col, 1);
}