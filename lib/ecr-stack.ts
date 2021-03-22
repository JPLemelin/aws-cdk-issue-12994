import * as cdk from '@aws-cdk/core'
import * as ecr from '@aws-cdk/aws-ecr'

export interface EcrStackProps extends cdk.StackProps {
  envName: string;
  imageName: string;
}

export class EcrStack extends cdk.Stack {

  public readonly ecr: ecr.IRepository

  constructor(scope: cdk.Construct, id: string, props: EcrStackProps) {
    super(scope, id, props)

    // ECR Repository
    this.ecr = new ecr.Repository(this, props.imageName, {
      repositoryName: `${props.envName}-ecr-${props.imageName}`,
    })
  }
}