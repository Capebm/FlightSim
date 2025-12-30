import * as Cesium from 'cesium';
import { Updatable } from '../core/GameLoop';

export interface VehicleConfig {
  modelUrl: string;
  scale?: number;
  position: Cesium.Cartesian3;
  heading?: number;
  pitch?: number;
  roll?: number;
  modelHeadingOffset?: number;
  /**
   * Optional appearance overrides for the glTF model.
   * NOTE: This is a per-model color blend in Cesium, not a true livery/texture swap.
   */
  modelColor?: Cesium.Color;
  modelColorBlendMode?: Cesium.ColorBlendMode;
  modelColorBlendAmount?: number;
  /**
   * Flag for TAP-specific livery customization
   */
  isTapVariant?: boolean;
}

export interface VehicleState {
  position: Cesium.Cartesian3;
  heading: number;
  pitch: number;
  roll: number;
  velocity: number;
  speed: number;
}

export abstract class Vehicle implements Updatable {
  protected primitive: Cesium.Model | null = null;
  protected position: Cesium.Cartesian3;
  protected hpRoll: Cesium.HeadingPitchRoll;
  protected velocity: number = 0;
  protected speed: number = 0;
  protected isReady: boolean = false;
  protected sceneRef: Cesium.Scene | null = null;
  protected modelHeadingOffset: number = 0;
  public physicsEnabled: boolean = true;

  public readonly id: string;
  public readonly config: VehicleConfig;

  private static readonly scratchPositionClone = new Cesium.Cartesian3();
  private static readonly scratchHPR = new Cesium.HeadingPitchRoll();

  constructor(id: string, config: VehicleConfig) {
    this.id = id;
    this.config = config;
    this.position = Cesium.Cartesian3.clone(config.position);
    this.hpRoll = new Cesium.HeadingPitchRoll(
      config.heading || 0,
      config.pitch || 0,
      config.roll || 0
    );
    this.modelHeadingOffset = config.modelHeadingOffset || 0;
  }

  public async initialize(scene: Cesium.Scene): Promise<void> {
    try {
      this.sceneRef = scene;
      
      Vehicle.scratchHPR.heading = this.hpRoll.heading + this.modelHeadingOffset;
      Vehicle.scratchHPR.pitch = this.hpRoll.pitch;
      Vehicle.scratchHPR.roll = this.hpRoll.roll;
      
      this.primitive = scene.primitives.add(
        await Cesium.Model.fromGltfAsync({
          url: this.config.modelUrl,
          scale: this.config.scale || 1.0,
          modelMatrix: Cesium.Transforms.headingPitchRollToFixedFrame(
            this.position,
            Vehicle.scratchHPR,
            Cesium.Ellipsoid.WGS84
          )
        })
      );

      this.primitive?.readyEvent.addEventListener(() => {
        this.applyModelAppearance();
        this.isReady = true;
        this.onModelReady();
      });
    } catch (error) {
      console.error(`Failed to load vehicle model: ${error}`);
    }
  }

  protected onModelReady(): void {
    // Override in subclasses for specific initialization
  }

  protected applyModelAppearance(): void {
    if (!this.primitive) return;

    if (this.config.modelColor) {
      this.primitive.color = this.config.modelColor;
      if (this.config.modelColorBlendMode !== undefined) {
        this.primitive.colorBlendMode = this.config.modelColorBlendMode;
      }
      if (typeof this.config.modelColorBlendAmount === 'number') {
        this.primitive.colorBlendAmount = this.config.modelColorBlendAmount;
      }
    }

    // Apply TAP-specific livery customization
    if (this.config.isTapVariant) {
      this.applyTapLivery();
    }
  }

  /**
   * Apply TAP Air Portugal livery customization
   * Attempts to customize materials for authentic TAP appearance:
   * - White fuselage (main body)
   * - Red tail fin accent (#d4002a)
   * 
   * This method tries to access the model's scene graph to customize individual materials.
   * If the model structure doesn't allow this, the white base color blend will still provide
   * a cleaner appearance than the previous red tint.
   */
  protected applyTapLivery(): void {
    if (!this.primitive) return;

    // Wait a bit for the model to fully initialize
    setTimeout(() => {
      try {
        // Access the model's scene graph to customize individual materials
        const scene = this.primitive?.sceneGraph;
        if (!scene || !scene.root) {
          return;
        }

        // TAP red color for tail accents
        const tapRed = Cesium.Color.fromCssColorString('#d4002a');
        const whiteColor = Cesium.Color.WHITE;
        
        // Traverse the scene graph to find and customize materials
        const processNode = (node: any): void => {
          if (!node) return;

          // Check if node has a mesh with materials
          if (node.mesh && node.mesh.primitives) {
            for (const primitive of node.mesh.primitives) {
              if (primitive.material) {
                const material = primitive.material;
                
                // Try to identify tail/vertical stabilizer by name
                // Common naming patterns: "tail", "fin", "vertical", "stabilizer"
                const nodeName = (node.name || '').toLowerCase();
                const isTailPart = nodeName.includes('tail') || 
                                  nodeName.includes('fin') || 
                                  nodeName.includes('vertical') ||
                                  nodeName.includes('stabilizer');

                if (isTailPart && material.uniforms) {
                  // Apply red color to tail parts
                  if (material.uniforms.baseColor) {
                    material.uniforms.baseColor = tapRed;
                  } else if (material.uniforms.diffuse) {
                    material.uniforms.diffuse = tapRed;
                  }
                } else if (!isTailPart && material.uniforms) {
                  // For fuselage/main body, lighten towards white
                  if (material.uniforms.baseColor) {
                    const currentColor = material.uniforms.baseColor;
                    if (currentColor) {
                      material.uniforms.baseColor = Cesium.Color.lerp(
                        currentColor,
                        whiteColor,
                        0.2,
                        new Cesium.Color()
                      );
                    }
                  }
                }
              }
            }
          }

          // Recursively process child nodes
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              processNode(child);
            }
          }
        };

        // Start processing from root
        processNode(scene.root);
      } catch (error) {
        // Silently fail - the white base color blend will still provide better appearance
        console.debug('TAP livery customization not available:', error);
      }
    }, 100);
  }

  public abstract update(deltaTime: number): void;

  public setInput(_input: Record<string, boolean | number | undefined>): void {
    // Override in subclasses
  }

  public toggleCollisionDetection?(): void {
    // Optional - override in subclasses that support collision detection
  }

  public getState(): VehicleState {
    Cesium.Cartesian3.clone(this.position, Vehicle.scratchPositionClone);
    return {
      position: Vehicle.scratchPositionClone,
      heading: this.hpRoll.heading,
      pitch: this.hpRoll.pitch,
      roll: this.hpRoll.roll,
      velocity: this.velocity,
      speed: this.speed
    };
  }

  public setState(state: VehicleState): void {
    this.position = Cesium.Cartesian3.clone(state.position);
    this.hpRoll.heading = state.heading;
    this.hpRoll.pitch = state.pitch;
    this.hpRoll.roll = state.roll;
    this.velocity = state.velocity;
    this.speed = state.speed;
    this.updateModelMatrix();
  }

  public getPosition(): Cesium.Cartesian3 {
    return Cesium.Cartesian3.clone(this.position, Vehicle.scratchPositionClone);
  }

  public getBoundingSphere(): Cesium.BoundingSphere | null {
    return this.primitive?.boundingSphere || null;
  }

  public isModelReady(): boolean {
    return this.isReady;
  }

  protected updateModelMatrix(): void {
    if (this.primitive) {
      Vehicle.scratchHPR.heading = this.hpRoll.heading + this.modelHeadingOffset;
      Vehicle.scratchHPR.pitch = this.hpRoll.pitch;
      Vehicle.scratchHPR.roll = this.hpRoll.roll;
      
      Cesium.Transforms.headingPitchRollToFixedFrame(
        this.position,
        Vehicle.scratchHPR,
        Cesium.Ellipsoid.WGS84,
        undefined,
        this.primitive.modelMatrix
      );
    }
  }

  public destroy(): void {
    if (this.primitive) {
      if (this.sceneRef) {
        try {
          this.sceneRef.primitives.remove(this.primitive);
        } catch {}
      }
      this.primitive = null;
      this.isReady = false;
    }
  }
}
